# Editing Scenarios

Crucible includes a visual scenario editor for creating and modifying security test scenarios. This guide covers both the visual editor and raw JSON editing.

---

## Opening the Editor

1. Navigate to **/scenarios**
2. Click any scenario card to open the detail dialog
3. Select the **Edit** tab

The editor opens in **Visual mode** by default. Toggle to **JSON mode** with the button in the top-right corner of the editor.

---

## Visual Editor

### Scenario Metadata

The top section contains scenario-level fields:

| Field | Required | Description |
|-------|----------|-------------|
| **ID** | Yes | Unique identifier (e.g., `auth-bypass-basic`). Used as the filename. |
| **Name** | Yes | Human-readable title (3–255 characters) |
| **Description** | No | What the scenario tests and why |
| **Category** | No | Grouping label (e.g., "API Security", "Web Attacks") |
| **Difficulty** | No | Beginner, Intermediate, Advanced, or Expert |
| **Kind** | No | Scenario type (e.g., "scenario") |
| **Target** | No | Target URL for the scenario (e.g., `http://localhost:5000`) |
| **Source IP** | No | Simulated source IP address |
| **Version** | No | Scenario version number |
| **Tags** | No | Classification labels. Type and press Enter to add. |
| **Rule IDs** | No | Associated security rule identifiers |

### Managing Steps

Below the metadata is the **Steps** section. Each step represents one HTTP request in the scenario.

#### Adding a Step

Click **Add Step** at the top of the steps list. A new step is appended with default values.

#### Reordering Steps

Hover over a step to reveal action buttons:
- **Up/Down arrows** — move the step in the list
- **Duplicate** — creates a copy with `-copy` appended to the ID
- **Delete** — removes the step (red trash icon)

#### Editing a Step

Click a step to expand it. Each step has these sections:

##### Identity

| Field | Description |
|-------|-------------|
| **Step ID** | Unique within the scenario (e.g., `login-probe`) |
| **Name** | Human-readable step label |
| **Stage** | Attack kill-chain stage. Suggested values: `reconnaissance`, `weaponization`, `delivery`, `exploitation`, `installation`, `command-and-control`, `actions-on-objectives`, `exfiltration`, `cleanup` |

##### Request

| Field | Description |
|-------|-------------|
| **Method** | HTTP method: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS |
| **URL** | Request URL. Supports `{{template}}` variables. |
| **Headers** | Key-value pairs (e.g., `Authorization: Bearer {{token}}`) |
| **Query Params** | Key-value pairs appended to the URL |
| **Body** | None, JSON, or raw text. JSON mode validates syntax. |

##### Execution Config

Toggle the switch to configure timing:

| Field | Description |
|-------|-------------|
| **Delay (ms)** | Wait before executing the step |
| **Retries** | Number of retry attempts on failure |
| **Jitter (ms)** | Random additional delay (0 to jitter value) |
| **Iterations** | Repeat the step N times |

##### Assertions (Expect)

Toggle the switch to add assertions. A step **passes** when all assertions succeed.

| Field | Description |
|-------|-------------|
| **Expected Status** | HTTP status code (e.g., 200, 403) |
| **Blocked** | Expect a 403 or 429 response |
| **Body Contains** | Response body must include this string |
| **Body Not Contains** | Response body must NOT include this string |
| **Header Present** | A response header with this name must exist |
| **Header Equals** | Key-value pairs that response headers must match exactly |

##### Variable Extraction

Toggle the switch to extract values from the response for use in later steps.

Each extraction rule has:

| Field | Description |
|-------|-------------|
| **Variable Name** | The `{{name}}` used in subsequent steps |
| **From** | Where to extract: `body`, `header`, or `status` |
| **Path** | Dot-notation path into the response (e.g., `data.token`, `user.id`) |

**Example**: Extract a JWT from a login response:
- Variable: `auth_token`
- From: `body`
- Path: `data.access_token`

Then use `{{auth_token}}` in later step headers: `Authorization: Bearer {{auth_token}}`

##### Dependencies

Type step IDs and press Enter to add dependencies. A step only executes after all its dependencies have completed. Click available step IDs below the input for quick selection.

---

## JSON Editor

Switch to JSON mode for full control over the scenario structure. The editor shows the complete JSON representation.

### Example Scenario JSON

```json
{
  "id": "auth-bypass-basic",
  "name": "Basic Authentication Bypass",
  "category": "API Security",
  "difficulty": "Beginner",
  "description": "Tests for common auth bypass vulnerabilities",
  "tags": ["auth", "owasp-api-2"],
  "steps": [
    {
      "id": "probe-unauth",
      "name": "Access without credentials",
      "stage": "reconnaissance",
      "request": {
        "method": "GET",
        "url": "/api/admin/users"
      },
      "expect": {
        "status": 401
      }
    },
    {
      "id": "login",
      "name": "Authenticate as regular user",
      "stage": "exploitation",
      "request": {
        "method": "POST",
        "url": "/api/auth/login",
        "headers": {
          "Content-Type": "application/json"
        },
        "body": {
          "username": "user",
          "password": "password123"
        }
      },
      "extract": {
        "token": {
          "from": "body",
          "path": "data.access_token"
        }
      },
      "expect": {
        "status": 200
      },
      "dependsOn": ["probe-unauth"]
    },
    {
      "id": "escalate",
      "name": "Access admin endpoint with user token",
      "stage": "exploitation",
      "request": {
        "method": "GET",
        "url": "/api/admin/users",
        "headers": {
          "Authorization": "Bearer {{token}}"
        }
      },
      "expect": {
        "blocked": true
      },
      "dependsOn": ["login"],
      "when": {
        "step": "login",
        "succeeded": true
      }
    }
  ]
}
```

### Switching Between Modes

You can switch between Visual and JSON modes at any time. If the JSON is valid, it round-trips cleanly. If you introduce a JSON syntax error, you'll need to fix it before switching back to Visual mode.

---

## Saving

Click **Save** in the editor toolbar. The scenario is:

1. Validated (ID, name, and at least one step are required)
2. Sent to the backend via `PUT /api/scenarios/{id}`
3. Structurally validated (dependency cycles, missing references, template variables)
4. Written to disk as `packages/catalog/scenarios/{id}.json`
5. Updated in the in-memory catalog

If validation fails, the error is shown in the editor. Fix the issue and save again.

---

## Validation Rules

The catalog validates scenarios on save:

| Rule | Severity | Example |
|------|----------|---------|
| **Missing reference** | Error | Step depends on a step ID that doesn't exist |
| **Dependency cycle** | Error | Step A depends on B, B depends on A |
| **Unused template variable** | Warning | Step uses `{{token}}` but no prior step extracts `token` |

Built-in template variables (`{{random}}`, `{{random_ip}}`, `{{timestamp}}`, `{{iteration}}`) never trigger warnings.

---

## Tips

- **Start simple**: Create a 1-2 step scenario first, run it as a simulation, then iterate.
- **Use extraction chains**: Login in step 1, extract the token, use it in all subsequent steps.
- **Test assertions incrementally**: Add one assertion at a time and verify with a simulation.
- **Use the Steps tab** in the detail dialog to review a scenario before editing — it shows the full execution plan without entering edit mode.
- **Duplicate scenarios**: Open an existing scenario that's close to what you need, duplicate steps, and modify them.

---

## What's Next

- [Running Scenarios](running-scenarios.md) — execute your scenario as a simulation or assessment
- [Scenario Engine](../architecture/scenario-engine.md) — understand the execution model in depth
