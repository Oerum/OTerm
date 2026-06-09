pub mod commands;

use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerInfo {
    pub available: bool,
    pub version: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerContainer {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub ports: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerImage {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created_since: String,
    pub in_use: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerVolume {
    pub name: String,
    pub driver: String,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerNetwork {
    pub id: String,
    pub name: String,
    pub driver: String,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerSummary {
    pub info: DockerInfo,
    pub containers: Vec<DockerContainer>,
    pub images: Vec<DockerImage>,
    pub volumes: Vec<DockerVolume>,
    pub networks: Vec<DockerNetwork>,
}

pub fn read_summary() -> Result<DockerSummary, String> {
    let version = docker_output(&["--version"]);
    let Ok(version_text) = version else {
        return Ok(empty_summary(
            false,
            None,
            Some("Docker CLI is not installed or not on PATH".into()),
        ));
    };

    let containers = match list_containers() {
        Ok(rows) => rows,
        Err(err) => {
            return Ok(empty_summary(
                false,
                Some(version_text.trim().to_string()),
                Some(normalize_error(err)),
            ));
        }
    };
    let used_images = containers
        .iter()
        .map(|container| container.image.clone())
        .filter(|image| !image.is_empty())
        .collect::<HashSet<_>>();

    Ok(DockerSummary {
        info: DockerInfo {
            available: true,
            version: Some(version_text.trim().to_string()),
            message: None,
        },
        images: list_images(&used_images)?,
        volumes: list_volumes()?,
        networks: list_networks()?,
        containers,
    })
}

pub fn run_container_action(id: String, action: String) -> Result<(), String> {
    let id = required(id, "Container id is required")?;
    match action.as_str() {
        "start" => docker_run(&["start", &id]),
        "stop" => docker_run(&["stop", &id]),
        "restart" => docker_run(&["restart", &id]),
        "pause" => docker_run(&["pause", &id]),
        "unpause" => docker_run(&["unpause", &id]),
        "remove" => docker_run(&["rm", &id]),
        _ => Err("Unsupported container action".into()),
    }
}

pub fn remove_image(id: String, force: bool) -> Result<(), String> {
    let id = required(id, "Image id is required")?;
    if force {
        docker_run(&["image", "rm", "-f", &id])
    } else {
        docker_run(&["image", "rm", &id])
    }
}

pub fn remove_volume(name: String, force: bool) -> Result<(), String> {
    let name = required(name, "Volume name is required")?;
    if force {
        docker_run(&["volume", "rm", "-f", &name])
    } else {
        docker_run(&["volume", "rm", &name])
    }
}

pub fn remove_network(id: String) -> Result<(), String> {
    let id = required(id, "Network id is required")?;
    docker_run(&["network", "rm", &id])
}

pub fn prune_unused(kind: String) -> Result<(), String> {
    match kind.as_str() {
        "containers" => docker_run(&["container", "prune", "-f"]),
        "images" => docker_run(&["image", "prune", "-a", "-f"]),
        "volumes" => docker_run(&["volume", "prune", "-a", "-f"]),
        "networks" => docker_run(&["network", "prune", "-f"]),
        "all" => {
            docker_run(&["container", "prune", "-f"])?;
            docker_run(&["image", "prune", "-a", "-f"])?;
            docker_run(&["volume", "prune", "-a", "-f"])?;
            docker_run(&["network", "prune", "-f"])
        }
        _ => Err("Prune kind must be containers, images, volumes, networks, or all".into()),
    }
}

pub fn container_logs(id: String, tail: u32) -> Result<String, String> {
    let id = required(id, "Container id is required")?;
    let tail = tail.clamp(10, 2000).to_string();
    docker_output(&["logs", "--tail", &tail, &id])
}

fn list_containers() -> Result<Vec<DockerContainer>, String> {
    let output = docker_output(&["ps", "-a", "--format", "{{json .}}"])?;
    Ok(parse_json_lines(&output)
        .into_iter()
        .map(|row| DockerContainer {
            id: field(&row, "ID"),
            name: field(&row, "Names"),
            image: field(&row, "Image"),
            state: field(&row, "State"),
            status: field(&row, "Status"),
            ports: field(&row, "Ports"),
        })
        .collect())
}

fn list_images(used_images: &HashSet<String>) -> Result<Vec<DockerImage>, String> {
    let output = docker_output(&["image", "ls", "--format", "{{json .}}"])?;
    Ok(parse_json_lines(&output)
        .into_iter()
        .map(|row| {
            let id = field(&row, "ID");
            let repository = field(&row, "Repository");
            let tag = field(&row, "Tag");
            let reference = image_reference(&repository, &tag);
            DockerImage {
                in_use: image_in_use(&id, &reference, used_images),
                id,
                repository,
                tag,
                size: field(&row, "Size"),
                created_since: field(&row, "CreatedSince"),
            }
        })
        .collect())
}

fn list_volumes() -> Result<Vec<DockerVolume>, String> {
    let output = docker_output(&["volume", "ls", "--format", "{{json .}}"])?;
    Ok(parse_json_lines(&output)
        .into_iter()
        .map(|row| DockerVolume {
            name: field(&row, "Name"),
            driver: field(&row, "Driver"),
            scope: field(&row, "Scope"),
        })
        .collect())
}

fn list_networks() -> Result<Vec<DockerNetwork>, String> {
    let output = docker_output(&["network", "ls", "--format", "{{json .}}"])?;
    Ok(parse_json_lines(&output)
        .into_iter()
        .map(|row| DockerNetwork {
            id: field(&row, "ID"),
            name: field(&row, "Name"),
            driver: field(&row, "Driver"),
            scope: field(&row, "Scope"),
        })
        .collect())
}

fn parse_json_lines(output: &str) -> Vec<Value> {
    output
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .collect()
}

fn field(row: &Value, key: &str) -> String {
    row.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn image_reference(repository: &str, tag: &str) -> String {
    if repository.is_empty() || repository == "<none>" {
        return String::new();
    }
    if tag.is_empty() || tag == "<none>" {
        return repository.to_string();
    }
    format!("{repository}:{tag}")
}

fn image_in_use(id: &str, reference: &str, used_images: &HashSet<String>) -> bool {
    used_images.contains(reference)
        || used_images.contains(id)
        || used_images.iter().any(|used| {
            let used = used.strip_prefix("sha256:").unwrap_or(used);
            let image_id = id.strip_prefix("sha256:").unwrap_or(id);
            !used.is_empty() && (used.starts_with(image_id) || image_id.starts_with(used))
        })
}

fn required(value: String, message: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(message.into())
    } else {
        Ok(trimmed.to_string())
    }
}

fn empty_summary(
    available: bool,
    version: Option<String>,
    message: Option<String>,
) -> DockerSummary {
    DockerSummary {
        info: DockerInfo {
            available,
            version,
            message,
        },
        containers: vec![],
        images: vec![],
        volumes: vec![],
        networks: vec![],
    }
}

fn normalize_error(err: String) -> String {
    let trimmed = err.trim();
    if trimmed.is_empty() {
        "Docker command failed".into()
    } else {
        trimmed.into()
    }
}

fn docker_output(args: &[&str]) -> Result<String, String> {
    let output = Command::new("docker")
        .args(args)
        .output()
        .map_err(|err| err.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn docker_run(args: &[&str]) -> Result<(), String> {
    let output = Command::new("docker")
        .args(args)
        .output()
        .map_err(|err| err.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    Ok(())
}
