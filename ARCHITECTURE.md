# Zeno Architecture Notes

## Career Friend Agent

The `CareerFriend` module acts as a conversational AI that orchestrates various capabilities across Zeno.

### Evolution to Tool-Based Architectures

**Current State**: The agent receives a full `<CAREER_SNAPSHOT>` (skills, projects, market signals, sprint data) injected directly into the system prompt for every request. This is currently working but limits the depth of context we can provide as the user's data grows. It uses generative UI payloads (`AgentUIPayload`) constructed by specific tools (e.g. `searchJobListings`, `recommendRoleCategories`) to render interactive elements in the chat interface.

**Future Scope (Retrieval-as-Tool)**: As the application scales, injecting the full `CAREER_SNAPSHOT` will become expensive and may exceed token limits or distract the model.
The planned evolution is to move toward **Retrieval-as-Tool (RAG)**. Instead of injecting the entire snapshot up front, we will provide the agent with a suite of retrieval tools:
- `getSkills()`
- `getMarketSignals()`
- `getActiveSprints()`

The agent will then be responsible for calling these tools dynamically to retrieve the precise subset of the user's profile needed to answer the current query. This will reduce prompt size and allow for much deeper, richer data sources without context overflow.
