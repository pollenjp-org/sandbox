use anyhow::Result;
use std::path::PathBuf;

async fn may_panic() -> Result<()> {
    let p = PathBuf::from("test.txt");
    let p2 = p.with_extension("js/on");
    println!("{:?}", p2);
    Ok(())
}

#[tokio::main]
async fn main() {
    let handle = tokio::spawn(may_panic());

    if let Err(e) = handle.await {
        println!("===error===: {:?}", e);
    } else {
        println!("success");
    }
}
