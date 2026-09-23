export type SourceControlPresentation = "hidden" | "ephemeral";

export type SourceControlPresentationEvent =
  | "toggle"
  | "escape"
  | "committed"
  | "pushed"
  | "leave-repo"
  | "open-palette";

export function nextSourceControlPresentation(
  current: SourceControlPresentation,
  event: SourceControlPresentationEvent,
): SourceControlPresentation {
  switch (event) {
    case "toggle":
      return current === "hidden" ? "ephemeral" : "hidden";
    case "escape":
    case "leave-repo":
      return "hidden";
    case "committed":
    case "pushed":
    case "open-palette":
      return current;
  }
}
