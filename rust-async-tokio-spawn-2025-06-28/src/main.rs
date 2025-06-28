use anyhow::Result;
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

#[tokio::main]
async fn main() {
    let mut set = JoinSet::new();
    set.spawn(say_hello1(SomeA { a: 1 }));
    set.spawn(say_hello2(Box::new(SomeA { a: 2 })));
    set.spawn(say_hello1(SomeA { a: 3 }));

    while let Some(result) = set.join_next().await {
        result.unwrap().unwrap();
    }
}
