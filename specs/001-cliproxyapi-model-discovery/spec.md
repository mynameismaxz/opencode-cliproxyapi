# Feature Specification: CLIProxyAPI Model Discovery Plugin

**Feature Branch**: `001-cliproxyapi-model-discovery`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "โดยปกติแล้วจากข้อมูลของ CLIProxyAPI มันจะอิงตามมาตรฐานของ OpenAI เป็นหลักอยู่แล้วทั้งในเรื่องของการ query model และ endpoint การเชื่อมต่อต่างๆ ซึ่งจุดประสงค์หลักคือการที่จะทำเป็น plugin สำหรับ Opencode V2 เพื่อที่จะให้มันสามารถที่จะดึง List ของ Model และเลือก Model นั้นได้เลย โดยที่ document ของการ develop ของ Opencode Plugin v2 จะอยู่ใน https://opencode.ai/v2/docs/build/ ซึ่งรายละเอียดจะแตกต่างจากของ v1 พอสมควร"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover and Select a Proxied Model (Priority: P1)

A developer runs CLIProxyAPI locally (or on a reachable host) and installs this plugin into
OpenCode. On the next OpenCode start, every model that CLIProxyAPI currently exposes appears
in OpenCode's model picker under a single, recognisable provider group. The developer picks
one and starts chatting. They never edit a provider or model entry by hand.

**Why this priority**: This is the entire value of the plugin. Without it nothing else
matters.

**Independent Test**: Start CLIProxyAPI with at least two models available, install the
plugin, start OpenCode, open the model picker, confirm both models are listed, select one,
send a prompt, receive a reply routed through CLIProxyAPI. Repeat once on an OpenCode 1.19.3+
install and once on an OpenCode 2.x install.

**Acceptance Scenarios**:

1. **Given** CLIProxyAPI is reachable and exposes N models, **When** OpenCode starts with the
   plugin installed, **Then** the model picker lists exactly those N models grouped under the
   plugin's provider name.
2. **Given** the user selects a discovered model, **When** they send a prompt, **Then** the
   request is served through CLIProxyAPI and a response is displayed in OpenCode.
3. **Given** the set of models exposed by CLIProxyAPI changes (a model added or removed) and
   OpenCode is restarted, **When** the user opens the model picker, **Then** the list reflects
   the new set without any config edits.
4. **Given** the user previously selected a discovered model as their default, **When** they
   restart OpenCode and the model is still exposed by CLIProxyAPI, **Then** that model is
   still the active default.
5. **Given** the same plugin package is installed into an OpenCode 1.19.3+ install and an
   OpenCode 2.x install, **When** each starts against the same CLIProxyAPI, **Then** both
   list the same models and both can complete a chat turn.

---

### User Story 2 - Minimal Connection Setup (Priority: P2)

A developer whose CLIProxyAPI is not on the default local address, or that requires an API
key, tells the plugin where to connect and how to authenticate using at most two settings.
The plugin reads these from environment variables or from the plugin's own configuration
block, and environment variables win if both are present.

**Why this priority**: Zero-config covers the default local case. Non-default hosts and
authenticated proxies are the next most common setup and must stay a two-value change.

**Independent Test**: Run CLIProxyAPI on a non-default port with an API key enabled. Provide
the base URL and key via environment variables only. Start OpenCode and confirm models are
discovered and usable. Repeat providing them via the plugin config block only.

**Acceptance Scenarios**:

1. **Given** no base URL is provided, **When** the plugin starts, **Then** it attempts
   discovery against the documented default local address.
2. **Given** a base URL is provided via environment variable and a different one via config,
   **When** the plugin starts, **Then** it uses the environment variable value.
3. **Given** CLIProxyAPI requires an API key and the key is provided, **When** the plugin
   discovers and the user sends a prompt, **Then** both discovery and chat succeed.
4. **Given** CLIProxyAPI requires an API key and no key is provided, **When** the plugin
   starts, **Then** discovery fails with a single clear message naming the missing setting,
   and OpenCode continues to work normally with its other providers.

---

### User Story 3 - Graceful Behaviour When the Proxy Is Unavailable (Priority: P3)

A developer starts OpenCode while CLIProxyAPI is stopped, slow, or misconfigured. OpenCode
still starts promptly and the developer's other providers keep working. A single warning
tells them the proxy could not be reached. Once the proxy is back, a restart restores the
proxied models.

**Why this priority**: The plugin lives inside the user's primary coding tool. Breaking or
hanging that tool is unacceptable, but this story only matters once discovery itself works.

**Independent Test**: Stop CLIProxyAPI, start OpenCode with the plugin installed, confirm
OpenCode is usable within its normal startup time, confirm one warning is shown, confirm no
proxied models appear, start CLIProxyAPI, restart OpenCode, confirm models appear.

**Acceptance Scenarios**:

1. **Given** CLIProxyAPI is unreachable, **When** OpenCode starts, **Then** OpenCode becomes
   usable within its normal startup window plus at most the plugin's documented discovery
   timeout, and exactly one warning is surfaced.
2. **Given** CLIProxyAPI returns a response the plugin cannot interpret, **When** discovery
   runs, **Then** no proxied models are registered, one warning is surfaced, and OpenCode is
   otherwise unaffected.
3. **Given** CLIProxyAPI exposes zero models, **When** discovery runs, **Then** the plugin
   registers nothing and surfaces one informational message rather than an error.
4. **Given** the user has their own providers configured in OpenCode, **When** the plugin
   runs in any state (success, failure, empty), **Then** those user-configured providers and
   models are unchanged.

---

### Edge Cases

- What happens when CLIProxyAPI exposes a model whose identifier collides with a model the
  user already configured under another provider? The plugin's models are namespaced under
  its own provider, so both coexist and are distinguishable in the picker.
- What happens when the model listing contains identifiers with characters OpenCode does not
  accept in model names? The plugin must either present them in a sanitised form that still
  routes to the original identifier, or skip them with a warning naming the identifier.
- What happens when the proxy responds slowly but eventually succeeds after the discovery
  timeout? The plugin treats it as unavailable for that start; a later restart retries.
- What happens when the base URL is syntactically invalid? The plugin surfaces one clear
  message naming the setting and the value rejected, and registers nothing.
- What happens when the user runs OpenCode in a directory with no project? Discovery still
  runs, since model availability is not project-specific.
- What happens when the same plugin is loaded twice (e.g. once globally and once per
  project)? Models must not be duplicated in the picker.
- What happens when the plugin is loaded by an OpenCode version outside the supported range
  (older than 1.19.3, or a future major)? The plugin surfaces one clear message stating the
  supported range, registers nothing, and leaves OpenCode otherwise unaffected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The plugin MUST query CLIProxyAPI's model listing each time OpenCode starts and
  register every returned model with OpenCode under a single dedicated provider group.
- **FR-002**: Registered models MUST be selectable from OpenCode's standard model picker and
  MUST be usable for chat without any additional user action.
- **FR-003**: Requests for a selected model MUST be routed to CLIProxyAPI's OpenAI-compatible
  chat endpoint using the model identifier exactly as CLIProxyAPI reported it.
- **FR-004**: The plugin MUST accept a base URL and an API key as its only required-or-
  optional connection settings. Each MUST be readable from an environment variable and from
  the plugin's own configuration block, with the environment variable taking precedence.
- **FR-005**: When no base URL is provided, the plugin MUST use a documented default that
  matches CLIProxyAPI's default local address.
- **FR-006**: The API key MUST be optional. When absent, discovery and chat MUST be attempted
  without authentication so that unauthenticated local proxies work with zero configuration.
- **FR-007**: The plugin MUST NOT require the user to edit OpenCode's provider or model
  configuration to add, remove, or rename proxied models.
- **FR-008**: The plugin MUST NOT modify, remove, or override providers or models the user
  configured themselves.
- **FR-009**: The plugin MUST NOT write to any user configuration file on disk.
- **FR-010**: Discovery MUST complete or give up within a bounded, documented time so that
  OpenCode startup is never blocked indefinitely.
- **FR-011**: On any discovery failure (unreachable, authentication rejected, timeout,
  uninterpretable response, invalid settings) the plugin MUST surface exactly one clear
  warning identifying the cause, register no proxied models, and allow OpenCode to continue
  normally.
- **FR-012**: The plugin MUST never expose the API key in any message, log line, or error
  text.
- **FR-013**: The plugin MUST make outbound requests only to the configured CLIProxyAPI base
  URL.
- **FR-014**: The plugin MUST support OpenCode 2.x as the primary host, following the
  OpenCode v2 plugin model documented at https://opencode.ai/v2/docs/build/, which differs
  substantially from the 1.x plugin model.
- **FR-015**: The plugin MUST also support OpenCode 1.19.3 and later 1.x releases, from the
  same installed package as 2.x. Every user story and acceptance scenario in this
  specification MUST pass on both host lines; a behaviour that works on one line but not
  the other is a defect, not a partial delivery.
- **FR-016**: If a model's reported identifier cannot be presented as-is in OpenCode, the
  plugin MUST either present a sanitised display form that still routes to the original
  identifier, or skip the model with a warning that names it.
- **FR-017**: Loading the plugin more than once in the same OpenCode session MUST NOT produce
  duplicate model entries.

### Key Entities *(include if feature involves data)*

- **Connection Settings**: The base URL of a CLIProxyAPI instance and an optional API key.
  Sourced from environment or plugin config; environment wins.
- **Discovered Model**: A model identifier reported by CLIProxyAPI, plus optional
  display-oriented attributes the proxy reports (such as owner or display name). One entry
  per identifier; belongs to the plugin's provider group.
- **Provider Group**: The single named grouping under which all discovered models appear in
  OpenCode's picker. Owned exclusively by the plugin; never contains user-configured models.
- **Discovery Outcome**: The result of one discovery attempt: success with N models, empty,
  or failure with a single categorised cause. Drives what the user sees at startup.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with a running default-local CLIProxyAPI can go from "plugin
  installed" to "chatting with a proxied model" in under 2 minutes with zero config edits.
- **SC-002**: 100% of models reported by CLIProxyAPI at startup appear in the OpenCode model
  picker, with no extras and no duplicates, across 20 consecutive restarts.
- **SC-003**: Connecting to a non-default or authenticated proxy requires changing at most 2
  settings and no other files.
- **SC-004**: When CLIProxyAPI is unreachable, OpenCode becomes interactive no more than the
  documented discovery timeout later than it would without the plugin, and shows exactly one
  warning.
- **SC-005**: In every failure scenario listed in the edge cases, user-configured providers
  and models remain fully usable, verified by sending a prompt to a non-proxied model.
- **SC-006**: A reviewer can read the full user-facing setup documentation in under 5
  minutes, and it mentions no more than two settings.
- **SC-007**: Zero occurrences of the API key value in logs or messages across the full test
  matrix.
- **SC-008**: Every success criterion above holds on both OpenCode 1.19.3+ and OpenCode 2.x
  using the same installed plugin package, with no host-specific setup steps for the user.

## Assumptions

- CLIProxyAPI's model listing and chat endpoints follow the OpenAI-compatible conventions
  the user described; the plugin relies on that shape and does not need a CLIProxyAPI-
  specific protocol.
- The default local address for CLIProxyAPI is its documented out-of-the-box host and port;
  the exact value will be confirmed and recorded during planning.
- CLIProxyAPI may run with authentication disabled, so an API key is optional rather than
  required.
- A single CLIProxyAPI instance per OpenCode session is sufficient; multiple simultaneous
  proxy endpoints are out of scope for this feature.
- Discovery happens at OpenCode startup. In-session refresh without restart is out of scope
  for this feature and may be a follow-up.
- Model capability metadata (context window, tool support, pricing) is out of scope beyond
  whatever CLIProxyAPI reports directly; sensible host defaults are acceptable.
- The plugin is installed through OpenCode's standard plugin installation mechanisms; no
  custom installer is in scope.
- The OpenCode v2 plugin documentation at https://opencode.ai/v2/docs/build/ is the
  authoritative reference for 2.x host capabilities; the corresponding 1.x plugin
  documentation is the reference for 1.19.3+. Both will be consulted in planning.
- Host support scope (confirmed by the user): OpenCode 1.19.3+ and 2.x ship together in
  this feature from one package. Neither line is deferred. The floor was originally stated
  as "1.8", which is not a published release; the user set it to 1.19.3 on 2026-10-20.
- The project constitution (`.specify/memory/constitution.md`) governs this feature,
  including the non-negotiable host-compatibility and never-break-the-host principles.
