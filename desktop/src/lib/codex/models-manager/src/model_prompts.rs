/// Dedicated vendor prompts for GeoCRM catalog ids that have a matching dump.
///
/// Unmatched slugs keep [`crate::model_info::BASE_INSTRUCTIONS`].
///
/// # Returns
/// Dedicated prompt text, or `None` when the slug should use the generic fallback.
pub fn dedicated_instructions_for_slug(slug: &str) -> Option<&'static str> {
    match catalog_key(slug) {
        "gpt-5.6-sol" => Some(include_str!("../../core/model-prompts/gpt-5.6-sol.md")),
        "gpt-5" | "gpt-5-mini" | "gpt-5-nano" | "gpt-5-pro" | "gpt-5.1" | "gpt-5.2"
        | "gpt-5.2-pro" | "gpt-5.4" | "gpt-5.4-pro" | "gpt-5.4-mini" | "gpt-5.4-nano"
        | "gpt-5.5" | "gpt-5.5-pro" => Some(include_str!("../../core/model-prompts/chatgpt-5.md")),
        "gpt-5.3-codex" => Some(include_str!("../../core/model-prompts/gpt-5.3-codex.md")),
        "gpt-4.1" | "gpt-4.1-mini" => Some(include_str!("../../core/model-prompts/gpt-4.1.md")),
        "gpt-4o" | "gpt-4o-mini" => Some(include_str!("../../core/model-prompts/gpt-4o.md")),
        "o3" | "o3-pro" => Some(include_str!("../../core/model-prompts/o3.md")),
        "gemini-2.5-pro" => Some(include_str!("../../core/model-prompts/gemini-2.5-pro.md")),
        "claude-opus-5" => Some(include_str!("../../core/model-prompts/claude-opus-5.md")),
        "claude-fable-5-1" => Some(include_str!("../../core/model-prompts/claude-fable-5-1.md")),
        "claude-fable-5" => Some(include_str!("../../core/model-prompts/claude-fable-5.md")),
        "claude-opus-4-7" => Some(include_str!("../../core/model-prompts/claude-opus-4-7.md")),
        "claude-opus-4-6" => Some(include_str!("../../core/model-prompts/claude-opus-4-6.md")),
        "claude-opus-4-5-20251101" => {
            Some(include_str!("../../core/model-prompts/claude-opus-4-5.md"))
        }
        "claude-sonnet-4-5-20250929" => Some(include_str!(
            "../../core/model-prompts/claude-sonnet-4-5.md"
        )),
        "grok-4.20" | "grok-4.20-0309-reasoning" | "grok-4.20-0309-non-reasoning" => {
            Some(include_str!("../../core/model-prompts/grok-4.20.md"))
        }
        "kimi-k2.6" => Some(include_str!("../../core/model-prompts/kimi-k2.6.md")),
        "mistral-large-latest" | "mistral-medium-latest" | "mistral-small-latest" => {
            Some(include_str!("../../core/model-prompts/mistral-lechat.md"))
        }
        "sonar-deep-research" => Some(include_str!(
            "../../core/model-prompts/sonar-deep-research.md"
        )),
        "MiniMax-M3"
        | "MiniMax-M2.7"
        | "MiniMax-M2.7-highspeed"
        | "MiniMax-M2.5"
        | "MiniMax-M2.5-highspeed"
        | "MiniMax-M2.1"
        | "MiniMax-M2.1-highspeed"
        | "MiniMax-M2" => Some(include_str!("../../core/model-prompts/minimax.md")),
        _ => None,
    }
}

/// Last path segment of a namespaced slug (`openai/gpt-4o-mini` -> `gpt-4o-mini`).
fn catalog_key(slug: &str) -> &str {
    slug.rsplit('/').next().unwrap_or(slug)
}

#[cfg(test)]
mod tests {
    use super::dedicated_instructions_for_slug;

    #[test]
    fn matched_catalog_ids_load_dedicated_dumps() {
        let gemini = dedicated_instructions_for_slug("gemini-2.5-pro").expect("gemini dump");
        assert!(gemini.contains("You are Gemini, a large language model built by Google."));

        let chatgpt = dedicated_instructions_for_slug("gpt-5.5").expect("chatgpt dump");
        assert!(chatgpt.contains("You are ChatGPT, a large language model based on the GPT-5"));

        let namespaced = dedicated_instructions_for_slug("openai/gpt-4o-mini").expect("4o dump");
        assert!(namespaced.contains("based on the GPT-4o architecture"));

        let minimax = dedicated_instructions_for_slug("MiniMax-M3").expect("minimax dump");
        assert!(minimax.contains("MiniMax-M1"));

        let fable = dedicated_instructions_for_slug("claude-fable-5").expect("fable dump");
        assert!(fable.contains("Claude Fable 5"));

        let fable51 = dedicated_instructions_for_slug("claude-fable-5-1").expect("fable 5.1 dump");
        assert!(fable51.contains("Claude Fable 5.1"));
    }

    #[test]
    fn unmatched_catalog_ids_have_no_dedicated_dump() {
        assert_eq!(dedicated_instructions_for_slug("gpt-5.6-terra"), None);
        assert_eq!(
            dedicated_instructions_for_slug("gemini-3.1-pro-preview"),
            None
        );
        assert_eq!(dedicated_instructions_for_slug("claude-sonnet-5"), None);
        assert_eq!(dedicated_instructions_for_slug("unknown-model"), None);
    }
}
