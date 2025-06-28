use anyhow::Result;
use dyn_clone::{DynClone, clone_trait_object};
use erased_serde::serialize_trait_object;
use futures::future::{BoxFuture, FutureExt};
use serde::Serialize;
use tokio::{
    task::JoinSet,
    time::{Duration, sleep},
};

struct SomeA {
    a: i32,
}

impl SomeB for SomeA {
    fn a(&self) -> i32 {
        self.a
    }
}

trait SomeB {
    fn a(&self) -> i32;
}

async fn say_hello1(a: SomeA) -> Result<()> {
    // Wait for a while before printing to make it a more interesting race.
    sleep(Duration::from_millis(100)).await;
    println!("hello1 {}", a.a);
    Ok(())
}

async fn say_hello2(a: Box<dyn SomeB + Send>) -> Result<()> {
    sleep(Duration::from_millis(100)).await;
    println!("hello2 {}", a.a());
    Ok(())
}

/// A string or a vector of strings
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(untagged)]
enum StringOrVecString {
    String(String),
    VecString(Vec<String>),
}

async fn say_hello3(a: StringOrVecString) -> Result<()> {
    sleep(Duration::from_millis(100)).await;
    let j = ::serde_json::to_string(&a)?;
    println!("hello3 {:?}", j);
    Ok(())
}

#[derive(Clone, Debug, PartialEq, Default, Serialize)]
#[serde(untagged)]
pub enum OptU<T: Serialize> {
    Some(T),
    #[default]
    Unset,
}

#[derive(Debug, Clone, Serialize)]
enum ExPlay {
    /// Sequential execution
    Sequential(Vec<ExPlay>),
    /// Parallel execution
    Parallel(Vec<ExPlay>),
    /// Single Play
    Single(Box<Play>),
    // Play(String),
}

#[derive(Debug, Clone, Serialize)]
struct Play {
    // x: OptU<serde_json::Value>,
    // y: String,
    tasks: Vec<Box<dyn TaskModule>>,
}

trait TaskModule: ::erased_serde::Serialize + DynClone + std::fmt::Debug + Send {}
serialize_trait_object!(TaskModule);
clone_trait_object!(TaskModule);

#[derive(Debug, Clone, Serialize)]
struct ConcreteTask {
    command: String,
    x: OptU<serde_json::Value>,
}

impl TaskModule for ConcreteTask {}

fn say_hello5(a: ExPlay, msg: String) -> BoxFuture<'static, Result<()>> {
    async move {
        match a {
            ExPlay::Sequential(plays) => {
                for play in plays {
                    Box::pin(say_hello5(play, format!("{}:{}", msg, "seq"))).await?;
                }
            }
            ExPlay::Parallel(plays) => {
                let mut set = JoinSet::new();
                for play in plays {
                    let play = play.clone();
                    set.spawn(Box::pin(say_hello5(play, format!("{}:{}", msg, "par"))));
                }
                while let Some(result) = set.join_next().await {
                    (result?)?;
                }
            }
            ExPlay::Single(play) => {
                println!("hello5:{}:Single:{:?}", msg, play);
            }
        }
        Ok(())
    }
    .boxed()
}

#[tokio::main]
async fn main() {
    let mut set = JoinSet::new();
    set.spawn(say_hello1(SomeA { a: 1 }));
    set.spawn(say_hello2(Box::new(SomeA { a: 2 })));
    set.spawn(say_hello1(SomeA { a: 3 }));
    set.spawn(say_hello3(StringOrVecString::String("hello".to_string())));
    set.spawn(say_hello3(StringOrVecString::VecString(vec![
        "hello".to_string(),
        "world".to_string(),
    ])));
    set.spawn(say_hello5(
        ExPlay::Sequential(vec![
            ExPlay::Single(Box::new(Play {
                tasks: vec![Box::new(ConcreteTask {
                    command: "1".to_string(),
                    x: OptU::Some(serde_json::json!({ "a": 1 })),
                })],
            })),
            ExPlay::Single(Box::new(Play {
                tasks: vec![Box::new(ConcreteTask {
                    command: "2".to_string(),
                    x: OptU::Some(serde_json::json!({ "a": 2 })),
                })],
            })),
            ExPlay::Single(Box::new(Play {
                tasks: vec![Box::new(ConcreteTask {
                    command: "3".to_string(),
                    x: OptU::Some(serde_json::json!({ "a": 3 })),
                })],
            })),
        ]),
        "root".to_owned(),
    ));
    set.spawn(say_hello5(
        ExPlay::Parallel(vec![
            ExPlay::Single(Box::new(Play {
                tasks: vec![Box::new(ConcreteTask {
                    command: "1".to_string(),
                    x: OptU::Some(serde_json::json!({ "a": 1 })),
                })],
            })),
            ExPlay::Single(Box::new(Play {
                tasks: vec![Box::new(ConcreteTask {
                    command: "2".to_string(),
                    x: OptU::Some(serde_json::json!({ "a": 2 })),
                })],
            })),
            ExPlay::Single(Box::new(Play {
                tasks: vec![Box::new(ConcreteTask {
                    command: "3".to_string(),
                    x: OptU::Some(serde_json::json!({ "a": 3 })),
                })],
            })),
        ]),
        "root".to_owned(),
    ));

    while let Some(result) = set.join_next().await {
        result.unwrap().unwrap();
    }
}
