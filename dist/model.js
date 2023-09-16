"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAzureOpenAILanguageModel = exports.createCohereLanguageModel = exports.createOpenAILanguageModel = exports.createLanguageModel = void 0;
const axios_1 = __importDefault(require("axios"));
const result_1 = require("./result");
/**
 * Creates a language model encapsulation of an OpenAI or Azure OpenAI REST API endpoint
 * chosen by environment variables.
 *
 * If an `OPENAI_API_KEY` environment variable exists, the `createOpenAILanguageModel` function
 * is used to create the instance. The `OPENAI_ENDPOINT` and `OPENAI_MODEL` environment variables
 * must also be defined or an exception will be thrown.
 *
 * If an `AZURE_OPENAI_API_KEY` environment variable exists, the `createAzureOpenAILanguageModel` function
 * is used to create the instance. The `AZURE_OPENAI_ENDPOINT` environment variable must also be defined
 * or an exception will be thrown.
 *
 * If none of these key variables are defined, an exception is thrown.
 * @returns An instance of `TypeChatLanguageModel`.
 */
function createLanguageModel(env) {
    console.log("Creating a language model...");
    if (env.OPENAI_API_KEY) {
        const apiKey = env.OPENAI_API_KEY ?? missingEnvironmentVariable("OPENAI_API_KEY");
        const model = env.OPENAI_MODEL ?? missingEnvironmentVariable("OPENAI_MODEL");
        const endPoint = env.OPENAI_ENDPOINT ?? "https://api.openai.com/v1/chat/completions";
        const org = env.OPENAI_ORGANIZATION ?? "";
        return createOpenAILanguageModel(apiKey, model, endPoint, org);
    }
    if (env.AZURE_OPENAI_API_KEY) {
        const apiKey = env.AZURE_OPENAI_API_KEY ??
            missingEnvironmentVariable("AZURE_OPENAI_API_KEY");
        const endPoint = env.AZURE_OPENAI_ENDPOINT ??
            missingEnvironmentVariable("AZURE_OPENAI_ENDPOINT");
        return createAzureOpenAILanguageModel(apiKey, endPoint);
    }
    if (env.COHERE_API_KEY) {
        console.log("Cohere API key detected...");
        const apiKey = env.COHERE_API_KEY ?? missingEnvironmentVariable("COHERE_API_KEY");
        const endPoint = env.COHERE_ENDPOINT ?? "https://api.cohere.ai/v1/generate";
        const maxTokens = env.MAX_TOKENS ?? "500";
        console.log({
            apiKey,
            endPoint,
            maxTokens,
        });
        return createCohereLanguageModel(apiKey, "command", endPoint, maxTokens);
    }
    missingEnvironmentVariable("OPENAI_API_KEY or AZURE_OPENAI_API_KEY or COHERE_API_KEY");
}
exports.createLanguageModel = createLanguageModel;
/**
 * Creates a language model encapsulation of an OpenAI REST API endpoint.
 * @param apiKey The OpenAI API key.
 * @param model The model name.
 * @param endPoint The URL of the OpenAI REST API endpoint. Defaults to "https://api.openai.com/v1/chat/completions".
 * @param org The OpenAI organization id.
 * @returns An instance of `TypeChatLanguageModel`.
 */
function createOpenAILanguageModel(apiKey, model, endPoint = "https://api.openai.com/v1/chat/completions", org = "") {
    return createAxiosLanguageModel(endPoint, {
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "OpenAI-Organization": org,
        },
    }, { model });
}
exports.createOpenAILanguageModel = createOpenAILanguageModel;
/**
 * Creates a language model encapsulation of a Cohere REST API endpoint.
 * @param apiKey The Cohere API key.
 * @param model The model name.
 * @param endPoint The URL of the Cohere REST API endpoint. Defaults to "https://api.openai.com/v1/chat/completions".
 * @returns An instance of `TypeChatLanguageModel`.
 */
function createCohereLanguageModel(apiKey, model, endPoint = "https://api.cohere.ai/v1/generate", maxTokens = "500") {
    return createAxiosLanguageModel(endPoint, {
        headers: {
            Authorization: `BEARER ${apiKey}`,
        },
    }, { model, max_tokens: parseInt(maxTokens) }, false);
}
exports.createCohereLanguageModel = createCohereLanguageModel;
/**
 * Creates a language model encapsulation of an Azure OpenAI REST API endpoint.
 * @param endPoint The URL of the OpenAI REST API endpoint. The URL must be in the format
 *   "https://{your-resource-name}.openai.azure.com/openai/deployments/{your-deployment-name}/chat/completions?api-version={API-version}".
 *   Example deployment names are "gpt-35-turbo" and "gpt-4". An example API versions is "2023-05-15".
 * @param apiKey The Azure OpenAI API key.
 * @returns An instance of `TypeChatLanguageModel`.
 */
function createAzureOpenAILanguageModel(apiKey, endPoint) {
    return createAxiosLanguageModel(endPoint, { headers: { "api-key": apiKey } }, {});
}
exports.createAzureOpenAILanguageModel = createAzureOpenAILanguageModel;
/**
 * Common implementation of language model encapsulation of an OpenAI REST API endpoint.
 */
function createAxiosLanguageModel(url, config, defaultParams, isOpenAI = true) {
    const client = axios_1.default.create(config);
    const model = {
        complete,
    };
    return model;
    async function complete(prompt) {
        let retryCount = 0;
        const retryMaxAttempts = model.retryMaxAttempts ?? 3;
        const retryPauseMs = model.retryPauseMs ?? 1000;
        while (true) {
            const params = {
                ...defaultParams,
                // TODO(michaelfromyeg): move this logic to the other calls
                ...(isOpenAI
                    ? { messages: [{ role: "user", content: prompt }], n: 1 }
                    : {
                        prompt,
                        k: 0,
                        stop_sequences: [],
                        return_likelihoods: "NONE",
                    }),
                temperature: 0,
            };
            console.log({ params });
            const result = await client.post(url, params, {
                validateStatus: (status) => true,
            });
            if (result.status === 200) {
                return isOpenAI
                    ? (0, result_1.success)(result.data.choices[0].message?.content ?? "")
                    : (0, result_1.success)(result.data.generations[0].text);
            }
            if (!isTransientHttpError(result.status) ||
                retryCount >= retryMaxAttempts) {
                if (result.status === 400) {
                    console.log(result.data.message);
                }
                return (0, result_1.error)(`REST API error ${result.status}: ${result.statusText}`);
            }
            await sleep(retryPauseMs);
            retryCount++;
        }
    }
}
/**
 * Returns true of the given HTTP status code represents a transient error.
 */
function isTransientHttpError(code) {
    switch (code) {
        case 429: // TooManyRequests
        case 500: // InternalServerError
        case 502: // BadGateway
        case 503: // ServiceUnavailable
        case 504: // GatewayTimeout
            return true;
    }
    return false;
}
/**
 * Sleeps for the given number of milliseconds.
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Throws an exception for a missing environment variable.
 */
function missingEnvironmentVariable(name) {
    throw new Error(`Missing environment variable: ${name}`);
}
