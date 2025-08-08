use anyhow::{Context as _, Result};
use tokio::process::Command;

#[tokio::main]
async fn main() -> Result<()> {
    run_cmd().await?;
    Ok(())
}

async fn run_cmd() -> Result<()> {
    let command = Command::new("yq")
        .arg(".")
        .output()
        .await
        // .with_context(|| "Failed to execute 'yq' command")?;
        .expect("Failed to execute 'yq' command");
    println!(
        "{}\n{}",
        String::from_utf8_lossy(&command.stdout),
        String::from_utf8_lossy(&command.stderr)
    );
    Ok(())
}
