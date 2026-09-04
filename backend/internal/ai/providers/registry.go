// Package providers is the cloud AI vendor registry for BYOK settings.
// Catalog is derived from Cherry Studio provider-registry (non-local cloud only).
package providers

// APIStyle selects how Completer and browser probes talk to a vendor.
type APIStyle string

const (
	// StyleOpenAI is OpenAI-compatible Chat Completions (Bearer).
	StyleOpenAI APIStyle = "openai"
	// StyleAnthropic is Anthropic Messages (x-api-key).
	StyleAnthropic APIStyle = "anthropic"
	// StyleGemini is Google Generative Language (query key).
	StyleGemini APIStyle = "gemini"
	// StyleUnsupported needs host/IAM config beyond a single API key.
	StyleUnsupported APIStyle = "unsupported"
)

// Provider is one cloud vendor entry for settings + connectivity.
type Provider struct {
	ID          string   `json:"id"`
	NameEn      string   `json:"nameEn"`
	APIStyle    APIStyle `json:"apiStyle"`
	BaseURL     string   `json:"baseUrl"`
	ModelsPath  string   `json:"modelsPath"`
	PingModelID string   `json:"pingModelId"`
}

// All is the ordered catalog exposed by GET /ai/providers.
// PingModelID is a cheap vendor-native (or gateway-common) chat model used by
// optional POST /ai/settings/ping Completer probes — not the Ask AI catalog.
// Dual-path connectivity uses GET models-list instead of Completer.
var All = []Provider{
	{ID: "cherryin", NameEn: "CherryIN", APIStyle: StyleOpenAI, BaseURL: "https://open.cherryin.net", ModelsPath: "/v1/models", PingModelID: "deepseek-chat"},
	{ID: "radeon-cloud", NameEn: "AMD GPU Cloud", APIStyle: StyleOpenAI, BaseURL: "https://developer.amd.com.cn/radeon/v1", ModelsPath: "/models", PingModelID: "DeepSeek-V4-Flash"},
	{ID: "silicon", NameEn: "Silicon", APIStyle: StyleOpenAI, BaseURL: "https://api.siliconflow.cn/v1", ModelsPath: "/models", PingModelID: "deepseek-ai/DeepSeek-V3"},
	{ID: "aihubmix", NameEn: "AiHubMix", APIStyle: StyleOpenAI, BaseURL: "https://aihubmix.com/v1", ModelsPath: "/models", PingModelID: "gpt-4o-mini"},
	{ID: "ocoolai", NameEn: "ocoolAI", APIStyle: StyleOpenAI, BaseURL: "https://api.ocoolai.com", ModelsPath: "/v1/models", PingModelID: "gpt-4o-mini"},
	{ID: "zhipu", NameEn: "ZhiPu", APIStyle: StyleOpenAI, BaseURL: "https://open.bigmodel.cn/api/paas/v4", ModelsPath: "/models", PingModelID: "glm-5.2"},
	{ID: "deepseek", NameEn: "deepseek", APIStyle: StyleOpenAI, BaseURL: "https://api.deepseek.com", ModelsPath: "/v1/models", PingModelID: "deepseek-v4-flash"},
	{ID: "alayanew", NameEn: "AlayaNew", APIStyle: StyleOpenAI, BaseURL: "https://deepseek.alayanew.com", ModelsPath: "/v1/models", PingModelID: "deepseek-chat"},
	{ID: "dmxapi", NameEn: "DMXAPI", APIStyle: StyleOpenAI, BaseURL: "https://www.dmxapi.cn", ModelsPath: "/v1/models", PingModelID: "gpt-4o-mini"},
	{ID: "aionly", NameEn: "AIOnly", APIStyle: StyleOpenAI, BaseURL: "https://api.aiionly.com", ModelsPath: "/v1/models", PingModelID: "gpt-4o-mini"},
	{ID: "burncloud", NameEn: "BurnCloud", APIStyle: StyleOpenAI, BaseURL: "https://ai.burncloud.com", ModelsPath: "/v1/models", PingModelID: "gpt-4o-mini"},
	{ID: "302ai", NameEn: "302.AI", APIStyle: StyleOpenAI, BaseURL: "https://api.302.ai", ModelsPath: "/v1/models", PingModelID: "gpt-4o-mini"},
	{ID: "lanyun", NameEn: "LANYUN", APIStyle: StyleOpenAI, BaseURL: "https://maas-api.lanyun.net", ModelsPath: "/v1/models", PingModelID: "deepseek-chat"},
	{ID: "ph8", NameEn: "PH8", APIStyle: StyleOpenAI, BaseURL: "https://ph8.co", ModelsPath: "/v1/models", PingModelID: "gpt-4o-mini"},
	{ID: "sophnet", NameEn: "SophNet", APIStyle: StyleOpenAI, BaseURL: "https://www.sophnet.com/api/open-apis/v1", ModelsPath: "/models", PingModelID: "DeepSeek-v3"},
	{ID: "ppio", NameEn: "PPIO", APIStyle: StyleOpenAI, BaseURL: "https://api.ppinfra.com/v3/openai", ModelsPath: "/models", PingModelID: "deepseek/deepseek-chat"},
	{ID: "qiniu", NameEn: "Qiniu", APIStyle: StyleOpenAI, BaseURL: "https://api.qnaigc.com", ModelsPath: "/v1/models", PingModelID: "deepseek-v3"},
	{ID: "openrouter", NameEn: "OpenRouter", APIStyle: StyleOpenAI, BaseURL: "https://openrouter.ai/api/v1", ModelsPath: "/models", PingModelID: "openai/gpt-4o-mini"},
	{ID: "anthropic", NameEn: "Anthropic", APIStyle: StyleAnthropic, BaseURL: "https://api.anthropic.com", ModelsPath: "/v1/models", PingModelID: "claude-3-5-haiku-latest"},
	{ID: "openai", NameEn: "OpenAI", APIStyle: StyleOpenAI, BaseURL: "https://api.openai.com", ModelsPath: "/v1/models", PingModelID: "gpt-4o-mini"},
	{ID: "opencode", NameEn: "OpenCode Go", APIStyle: StyleOpenAI, BaseURL: "https://opencode.ai/zen/go/v1", ModelsPath: "/models", PingModelID: "gpt-4o-mini"},
	{ID: "azure-openai", NameEn: "Azure OpenAI", APIStyle: StyleUnsupported, BaseURL: "", ModelsPath: "", PingModelID: ""},
	{ID: "gemini", NameEn: "Gemini", APIStyle: StyleGemini, BaseURL: "https://generativelanguage.googleapis.com", ModelsPath: "/v1beta/models", PingModelID: "gemini-3.6-flash"},
	{ID: "vertexai", NameEn: "VertexAI", APIStyle: StyleUnsupported, BaseURL: "", ModelsPath: "", PingModelID: ""},
	{ID: "github", NameEn: "Github Models", APIStyle: StyleOpenAI, BaseURL: "https://models.github.ai/inference", ModelsPath: "/models", PingModelID: "openai/gpt-4o-mini"},
	{ID: "copilot", NameEn: "Github Copilot", APIStyle: StyleOpenAI, BaseURL: "https://api.githubcopilot.com", ModelsPath: "/v1/models", PingModelID: "gpt-4o-mini"},
	{ID: "moonshot", NameEn: "Moonshot AI", APIStyle: StyleOpenAI, BaseURL: "https://api.moonshot.cn", ModelsPath: "/v1/models", PingModelID: "kimi-k3"},
	{ID: "baichuan", NameEn: "BAICHUAN AI", APIStyle: StyleOpenAI, BaseURL: "https://api.baichuan-ai.com", ModelsPath: "/v1/models", PingModelID: "Baichuan4-Turbo"},
	{ID: "dashscope", NameEn: "Bailian", APIStyle: StyleOpenAI, BaseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", ModelsPath: "/models", PingModelID: "qwen3.7-plus"},
	{ID: "stepfun", NameEn: "StepFun", APIStyle: StyleOpenAI, BaseURL: "https://api.stepfun.com", ModelsPath: "/v1/models", PingModelID: "step-1-8k"},
	{ID: "doubao", NameEn: "doubao", APIStyle: StyleOpenAI, BaseURL: "https://ark.cn-beijing.volces.com/api/v3", ModelsPath: "/models", PingModelID: "doubao-1-5-lite-32k"},
	{ID: "minimax", NameEn: "MiniMax", APIStyle: StyleOpenAI, BaseURL: "https://api.minimaxi.com/v1", ModelsPath: "/models", PingModelID: "MiniMax-M3"},
	{ID: "groq", NameEn: "Groq", APIStyle: StyleOpenAI, BaseURL: "https://api.groq.com/openai", ModelsPath: "/v1/models", PingModelID: "openai/gpt-oss-120b"},
	{ID: "together", NameEn: "Together", APIStyle: StyleOpenAI, BaseURL: "https://api.together.ai", ModelsPath: "/v1/models", PingModelID: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo"},
	{ID: "fireworks", NameEn: "Fireworks", APIStyle: StyleOpenAI, BaseURL: "https://api.fireworks.ai/inference", ModelsPath: "/models", PingModelID: "accounts/fireworks/models/llama-v3p1-8b-instruct"},
	{ID: "nvidia", NameEn: "nvidia", APIStyle: StyleOpenAI, BaseURL: "https://integrate.api.nvidia.com", ModelsPath: "/v1/models", PingModelID: "meta/llama-3.1-8b-instruct"},
	{ID: "grok", NameEn: "Grok", APIStyle: StyleOpenAI, BaseURL: "https://api.x.ai", ModelsPath: "/v1/models", PingModelID: "grok-4.6"},
	{ID: "mistral", NameEn: "Mistral", APIStyle: StyleOpenAI, BaseURL: "https://api.mistral.ai", ModelsPath: "/v1/models", PingModelID: "mistral-small-latest"},
	{ID: "jina", NameEn: "Jina", APIStyle: StyleOpenAI, BaseURL: "https://api.jina.ai", ModelsPath: "/v1/models", PingModelID: "jina-embeddings-v3"},
	{ID: "perplexity", NameEn: "Perplexity", APIStyle: StyleOpenAI, BaseURL: "https://api.perplexity.ai", ModelsPath: "/v1/models", PingModelID: "sonar"},
	{ID: "modelscope", NameEn: "ModelScope", APIStyle: StyleOpenAI, BaseURL: "https://api-inference.modelscope.cn/v1", ModelsPath: "/models", PingModelID: "Qwen/Qwen2.5-7B-Instruct"},
	{ID: "xirang", NameEn: "Xirang", APIStyle: StyleOpenAI, BaseURL: "https://wishub-x1.ctyun.cn", ModelsPath: "/v1/models", PingModelID: "deepseek-chat"},
	{ID: "tokenhub", NameEn: "TokenHub", APIStyle: StyleOpenAI, BaseURL: "https://tokenhub.tencentmaas.com/v1", ModelsPath: "/models", PingModelID: "hunyuan-lite"},
	{ID: "baidu-cloud", NameEn: "Baidu Cloud", APIStyle: StyleOpenAI, BaseURL: "https://qianfan.baidubce.com/v2", ModelsPath: "/models", PingModelID: "ernie-4.0-turbo-8k"},
	{ID: "voyageai", NameEn: "VoyageAI", APIStyle: StyleOpenAI, BaseURL: "https://api.voyageai.com", ModelsPath: "/v1/models", PingModelID: "voyage-3-lite"},
	{ID: "aws-bedrock", NameEn: "AWS Bedrock", APIStyle: StyleUnsupported, BaseURL: "", ModelsPath: "", PingModelID: ""},
	{ID: "poe", NameEn: "Poe", APIStyle: StyleOpenAI, BaseURL: "https://api.poe.com/v1", ModelsPath: "/models", PingModelID: "GPT-4o-Mini"},
	{ID: "longcat", NameEn: "LongCat", APIStyle: StyleOpenAI, BaseURL: "https://api.longcat.chat/openai", ModelsPath: "/v1/models", PingModelID: "LongCat-Flash-Chat"},
	{ID: "huggingface", NameEn: "Hugging Face", APIStyle: StyleOpenAI, BaseURL: "https://router.huggingface.co/v1", ModelsPath: "/models", PingModelID: "Qwen/Qwen2.5-7B-Instruct"},
	{ID: "gateway", NameEn: "Vercel AI Gateway", APIStyle: StyleOpenAI, BaseURL: "https://ai-gateway.vercel.sh/v1/ai", ModelsPath: "/models", PingModelID: "openai/gpt-4o-mini"},
	{ID: "cerebras", NameEn: "Cerebras AI", APIStyle: StyleOpenAI, BaseURL: "https://api.cerebras.ai/v1", ModelsPath: "/models", PingModelID: "llama3.1-8b"},
	{ID: "mimo", NameEn: "Xiaomi MiMo", APIStyle: StyleOpenAI, BaseURL: "https://api.xiaomimimo.com", ModelsPath: "/v1/models", PingModelID: "mimo-v2-flash"},
	{ID: "zai", NameEn: "zai", APIStyle: StyleOpenAI, BaseURL: "https://api.z.ai/api/paas/v4", ModelsPath: "/models", PingModelID: "glm-5.2"},
	{ID: "minimax-global", NameEn: "minimax-global", APIStyle: StyleOpenAI, BaseURL: "https://api.minimax.io/v1", ModelsPath: "/models", PingModelID: "MiniMax-M3"},
}

var byID map[string]Provider

func init() {
	byID = make(map[string]Provider, len(All))
	for _, p := range All {
		byID[p.ID] = p
	}
}

// Get returns a provider by id.
func Get(id string) (Provider, bool) {
	p, ok := byID[id]
	return p, ok
}

// List returns a copy of the catalog for JSON responses.
func List() []Provider {
	out := make([]Provider, len(All))
	copy(out, All)
	return out
}
