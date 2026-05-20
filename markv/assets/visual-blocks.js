(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.MarkVVisualBlocks = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  const VISUAL_BLOCK_CATEGORY_ORDER = Object.freeze([
    "Diagram",
    "Table",
    "Callout",
    "Code Block",
    "Checklist",
    "Divider",
  ]);

  const COMMON_DIAGRAM_IDS = Object.freeze([
    "diagram.flowchart",
    "diagram.sequence",
    "diagram.er",
    "diagram.state",
    "diagram.mindmap",
    "diagram.timeline",
    "diagram.kanban",
    "diagram.gantt",
  ]);

  const COMMON_DIAGRAM_ID_SET = new Set(COMMON_DIAGRAM_IDS);

  function lines(parts) {
    return parts.join("\n");
  }

  function fence(language, body) {
    return "```" + language + "\n" + body.replace(/\n+$/g, "") + "\n```";
  }

  const visualBlockCommands = Object.freeze([
    {
      id: "diagram.flowchart",
      title: "Flowchart",
      category: "Diagram",
      description: "Insert a process or decision flow diagram.",
      aliases: Object.freeze(["flow", "process", "decision", "workflow"]),
      template: fence(
        "mermaid",
        lines([
          "flowchart TD",
          "    Start([Begin]) --> Upload[/Upload File/]",
          "    Upload --> Check{File type allowed?}",
          "",
          "    Check -->|Yes| Scan[Run validation checks]",
          "    Check -->|No| Reject[Show unsupported file message]",
          "",
          "    Reject --> Upload",
          "    Scan --> Transform[Normalize metadata]",
          "    Transform --> Store[(Persist document)]",
          "    Store --> Finish([Complete])",
        ]),
      ),
      cursor: Object.freeze({ anchor: "Begin" }),
      priority: 10,
      advanced: false,
    },
    {
      id: "diagram.sequence",
      title: "Sequence Diagram",
      category: "Diagram",
      description:
        "Insert an interaction flow between users, clients, APIs, and services.",
      aliases: Object.freeze(["seq", "api flow", "interaction", "request flow"]),
      template: fence(
        "mermaid",
        lines([
          "sequenceDiagram",
          "    actor Visitor",
          "    participant Web as Web App",
          "    participant API as Backend API",
          "    participant Cache as Redis Cache",
          "    participant DB as Postgres DB",
          "",
          "    Visitor->>Web: Submit search query",
          "    Web->>API: GET /search?q=...",
          "    API->>Cache: Check cached result",
          "",
          "    alt Cache hit",
          "        Cache-->>API: Return cached payload",
          "    else Cache miss",
          "        API->>DB: Run search query",
          "        DB-->>API: Matching records",
          "        API->>Cache: Store result briefly",
          "    end",
          "",
          "    API-->>Web: Search response",
          "    Web-->>Visitor: Render results",
          "",
          "    Note over API,Cache: Cache avoids repeated DB reads",
        ]),
      ),
      cursor: Object.freeze({ anchor: "Visitor" }),
      priority: 20,
      advanced: false,
    },
    {
      id: "diagram.class",
      title: "Class Diagram",
      category: "Diagram",
      description: "Insert an object model or domain model diagram.",
      aliases: Object.freeze(["class", "oop", "model", "domain model"]),
      template: fence(
        "mermaid",
        lines([
          "classDiagram",
          "    class Document {",
          "        +String title",
          "        +String slug",
          "        +Date createdAt",
          "        +publish() void",
          "        +archive() void",
          "    }",
          "",
          "    class Article {",
          "        +String author",
          "        +String summary",
          "        +generateExcerpt() String",
          "    }",
          "",
          "    class Note {",
          "        +String notebook",
          "        +bool pinned",
          "        +pin() void",
          "    }",
          "",
          "    class Tag {",
          "        +String name",
          "        +String color",
          "    }",
          "",
          "    class User {",
          "        +String email",
          "        +String displayName",
          "        +createDocument() Document",
          "    }",
          "",
          "    Document <|-- Article",
          "    Document <|-- Note",
          '    User "1" --> "*" Document : creates',
          '    Document "*" --> "*" Tag : tagged with',
        ]),
      ),
      cursor: Object.freeze({ anchor: "Document" }),
      priority: 120,
      advanced: true,
    },
    {
      id: "diagram.er",
      title: "ER Diagram",
      category: "Diagram",
      description: "Insert a database entity relationship diagram.",
      aliases: Object.freeze(["db", "database", "schema", "entity relationship"]),
      template: fence(
        "mermaid",
        lines([
          "erDiagram",
          "    USER {",
          "        uuid id PK",
          "        string email",
          "        string full_name",
          "        timestamp joined_at",
          "    }",
          "",
          "    WORKSPACE {",
          "        uuid id PK",
          "        uuid owner_id FK",
          "        string name",
          "        string plan",
          "    }",
          "",
          "    PROJECT {",
          "        uuid id PK",
          "        uuid workspace_id FK",
          "        string title",
          "        string status",
          "    }",
          "",
          "    TASK {",
          "        uuid id PK",
          "        uuid project_id FK",
          "        string title",
          "        string priority",
          "        timestamp due_at",
          "    }",
          "",
          "    USER ||--o{ WORKSPACE : owns",
          "    WORKSPACE ||--o{ PROJECT : contains",
          "    PROJECT ||--o{ TASK : tracks",
        ]),
      ),
      cursor: Object.freeze({ anchor: "USER" }),
      priority: 30,
      advanced: false,
    },
    {
      id: "diagram.state",
      title: "State Diagram",
      category: "Diagram",
      description: "Insert a lifecycle or state transition diagram.",
      aliases: Object.freeze(["state", "status", "lifecycle", "transition"]),
      template: fence(
        "mermaid",
        lines([
          "stateDiagram-v2",
          "    [*] --> Draft",
          "",
          "    Draft --> Reviewing : submit",
          "    Reviewing --> Approved : approve",
          "    Reviewing --> Draft : request changes",
          "    Approved --> Scheduled : pick publish date",
          "    Scheduled --> Published : publish",
          "    Published --> Archived : archive",
          "    Archived --> Draft : restore",
          "",
          "    state Reviewing {",
          "        [*] --> AutomatedChecks",
          "        AutomatedChecks --> HumanReview : checks passed",
          "        HumanReview --> [*]",
          "    }",
        ]),
      ),
      cursor: Object.freeze({ anchor: "Draft" }),
      priority: 40,
      advanced: false,
    },
    {
      id: "diagram.gantt",
      title: "Gantt Chart",
      category: "Diagram",
      description: "Insert a project timeline or delivery plan.",
      aliases: Object.freeze(["roadmap", "schedule", "project plan", "timeline plan"]),
      template: fence(
        "mermaid",
        lines([
          "gantt",
          "    title Documentation Refresh Plan",
          "    dateFormat  YYYY-MM-DD",
          "    excludes weekends",
          "",
          "    section Audit",
          "    Inventory existing docs     :done,    a1, 2026-02-03, 5d",
          "    Identify stale pages        :done,    a2, after a1, 4d",
          "    Prioritize critical guides  :active,  a3, after a2, 3d",
          "",
          "    section Writing",
          "    Rewrite setup guide         :crit,    w1, 2026-02-17, 7d",
          "    Update API examples         :         w2, after w1, 6d",
          "    Add troubleshooting page    :         w3, after w2, 4d",
          "",
          "    section Review",
          "    Technical review            :crit,    r1, after w3, 4d",
          "    Copy edit                   :         r2, after r1, 3d",
          "",
          "    section Release",
          "    Publish docs                :milestone, 2026-03-18, 0d",
        ]),
      ),
      cursor: Object.freeze({ anchor: "Documentation Refresh Plan" }),
      priority: 80,
      advanced: false,
    },
    {
      id: "diagram.pie",
      title: "Pie Chart",
      category: "Diagram",
      description: "Insert a simple proportion or distribution chart.",
      aliases: Object.freeze(["pie", "share", "distribution", "breakdown"]),
      template: fence(
        "mermaid",
        lines([
          "pie title Support Ticket Categories",
          '    "Billing"       : 22',
          '    "Login Issues"  : 18',
          '    "Bug Reports"   : 27',
          '    "Feature Ideas" : 14',
          '    "How-to Help"   : 19',
        ]),
      ),
      cursor: Object.freeze({ anchor: "Support Ticket Categories" }),
      priority: 130,
      advanced: true,
    },
    {
      id: "diagram.gitgraph",
      title: "Git Graph",
      category: "Diagram",
      description: "Insert a Git branch and merge history diagram.",
      aliases: Object.freeze(["git", "branch", "merge", "release"]),
      template: fence(
        "mermaid",
        lines([
          "gitGraph",
          '    commit id: "Create project shell"',
          '    commit id: "Add base config"',
          "",
          "    branch feature/editor",
          "    checkout feature/editor",
          '    commit id: "Add markdown input"',
          '    commit id: "Render preview pane"',
          '    commit id: "Persist drafts"',
          "",
          "    branch feature/export",
          "    checkout feature/export",
          '    commit id: "Add PDF export"',
          '    commit id: "Add HTML export"',
          "",
          "    checkout feature/editor",
          '    merge feature/export id: "Bring export into editor"',
          "",
          "    checkout main",
          '    merge feature/editor id: "Ship editor" tag: "v0.2.0"',
          "",
          "    branch fix/mobile-layout",
          "    checkout fix/mobile-layout",
          '    commit id: "Fix narrow screen toolbar" type: HIGHLIGHT',
          "",
          "    checkout main",
          '    merge fix/mobile-layout id: "Mobile polish" tag: "v0.2.1"',
        ]),
      ),
      cursor: Object.freeze({ anchor: "Create project shell" }),
      priority: 140,
      advanced: true,
    },
    {
      id: "diagram.mindmap",
      title: "Mind Map",
      category: "Diagram",
      description: "Insert a structured idea map.",
      aliases: Object.freeze(["mind", "ideas", "brainstorm", "concept map"]),
      template: fence(
        "mermaid",
        lines([
          "mindmap",
          "  root((Knowledge App))",
          "    Capture",
          "      Web Clipper",
          "      Quick Notes",
          "      Voice Notes",
          "    Organize",
          "      Tags",
          "      Collections",
          "      Search",
          "    Understand",
          "      Summaries",
          "      Related Notes",
          "      Question Answering",
          "    Share",
          "      Public Pages",
          "      PDF Export",
          "      Team Spaces",
        ]),
      ),
      cursor: Object.freeze({ anchor: "Knowledge App" }),
      priority: 50,
      advanced: false,
    },
    {
      id: "diagram.timeline",
      title: "Timeline",
      category: "Diagram",
      description: "Insert a chronological event timeline.",
      aliases: Object.freeze(["history", "events", "chronology", "milestones"]),
      template: fence(
        "mermaid",
        lines([
          "timeline",
          "    title Evolution of Cloud Native Platforms",
          "",
          "    section 2000s",
          "        2006 : Amazon EC2 introduced",
          "        2008 : Google App Engine launched",
          "        2009 : DevOps term gains momentum",
          "",
          "    section 2010s",
          "        2013 : Docker popularizes containers",
          "        2014 : Kubernetes announced",
          "        2015 : CNCF founded",
          "        2017 : Service mesh adoption grows",
          "",
          "    section 2020s",
          "        2020 : Platform engineering gains visibility",
          "        2022 : FinOps becomes mainstream in cloud teams",
          "        2023 : Internal developer platforms expand",
          "        2024 : AI-assisted operations accelerate",
        ]),
      ),
      cursor: Object.freeze({ anchor: "Evolution of Cloud Native Platforms" }),
      priority: 60,
      advanced: false,
    },
    {
      id: "diagram.quadrant",
      title: "Quadrant Chart",
      category: "Diagram",
      description: "Insert a two-axis prioritization matrix.",
      aliases: Object.freeze(["matrix", "priority", "impact effort", "2x2"]),
      template: fence(
        "mermaid",
        lines([
          "quadrantChart",
          "    title Engineering Backlog Prioritization",
          "    x-axis Low Complexity --> High Complexity",
          "    y-axis Low Business Value --> High Business Value",
          "",
          "    quadrant-1 Easy Wins",
          "    quadrant-2 Strategic Bets",
          "    quadrant-3 Nice-to-Haves",
          "    quadrant-4 Expensive Distractions",
          "",
          "    Improve onboarding: [0.25, 0.85]",
          "    Add audit logs: [0.55, 0.9]",
          "    Rewrite billing engine: [0.9, 0.95]",
          "    Theme picker: [0.2, 0.35]",
          "    Advanced reports: [0.65, 0.7]",
          "    Experimental chat UI: [0.8, 0.45]",
          "    Fix flaky tests: [0.3, 0.75]",
          "    Plugin marketplace: [0.95, 0.6]",
        ]),
      ),
      cursor: Object.freeze({ anchor: "Engineering Backlog Prioritization" }),
      priority: 150,
      advanced: true,
    },
    {
      id: "diagram.xy",
      title: "XY Chart",
      category: "Diagram",
      description: "Insert a bar or line chart with x/y axes.",
      aliases: Object.freeze(["chart", "bar", "line", "metrics"]),
      template: fence(
        "mermaid",
        lines([
          "xychart-beta",
          '    title "Weekly Active Users"',
          "    x-axis [Week1, Week2, Week3, Week4, Week5, Week6, Week7, Week8]",
          '    y-axis "Users" 0 --> 5000',
          "    bar  [900, 1200, 1500, 1700, 2300, 2800, 3600, 4300]",
          "    line [900, 1200, 1500, 1700, 2300, 2800, 3600, 4300]",
        ]),
      ),
      cursor: Object.freeze({ anchor: "Weekly Active Users" }),
      priority: 160,
      advanced: true,
    },
    {
      id: "diagram.architecture",
      title: "Architecture Diagram",
      category: "Diagram",
      description: "Insert a system architecture diagram.",
      aliases: Object.freeze(["architecture", "system", "services", "infra"]),
      template: fence(
        "mermaid",
        lines([
          "architecture-beta",
          "    group edge(cloud)[Edge Layer]",
          "    group services(server)[Application Services]",
          "    group data(database)[Data Layer]",
          "",
          "    service cdn(internet)[CDN] in edge",
          "    service web(server)[Web App] in services",
          "    service api(server)[Core API] in services",
          "    service queue(server)[Job Queue] in services",
          "    service postgres(database)[Postgres] in data",
          "    service objectStore(disk)[Object Storage] in data",
          "",
          "    cdn:R --> L:web",
          "    web:R --> L:api",
          "    api:B --> T:postgres",
          "    api:R --> L:queue",
          "    queue:B --> T:objectStore",
        ]),
      ),
      cursor: Object.freeze({ anchor: "Edge Layer" }),
      priority: 170,
      advanced: true,
    },
    {
      id: "diagram.kanban",
      title: "Kanban Board",
      category: "Diagram",
      description: "Insert a simple work tracking board.",
      aliases: Object.freeze(["board", "todo", "tasks", "workflow board"]),
      template: fence(
        "mermaid",
        lines([
          "kanban",
          "  Backlog",
          "    Add keyboard shortcuts",
          "    Improve empty states",
          "    Review pricing page copy",
          "",
          "  Doing",
          "    Build account settings",
          "    Refactor dashboard cards",
          "",
          "  Review",
          "    Update onboarding flow",
          "",
          "  Shipped",
          "    Add dark mode",
          "    Fix login redirect",
        ]),
      ),
      cursor: Object.freeze({ anchor: "Backlog" }),
      priority: 70,
      advanced: false,
    },
    {
      id: "diagram.sankey",
      title: "Sankey Diagram",
      category: "Diagram",
      description: "Insert a flow volume diagram.",
      aliases: Object.freeze(["flow volume", "conversion", "funnel", "traffic"]),
      template: fence(
        "mermaid",
        lines([
          "sankey-beta",
          "Website,Signup,320",
          "Website,Docs,180",
          "Docs,Signup,95",
          "Signup,Trial,250",
          "Trial,Activated,140",
          "Trial,Churned,110",
          "Activated,Paid,72",
          "Activated,Free,68",
        ]),
      ),
      cursor: Object.freeze({ anchor: "Website" }),
      priority: 180,
      advanced: true,
    },
    {
      id: "diagram.block",
      title: "Block Diagram",
      category: "Diagram",
      description: "Insert a block layout diagram.",
      aliases: Object.freeze(["blocks", "layout", "components", "module map"]),
      template: fence(
        "mermaid",
        lines([
          "block-beta",
          "  columns 4",
          "",
          "  Client:4",
          '  browser["Browser UI"]:2',
          '  mobile["Mobile PWA"]:2',
          "",
          "  space:4",
          "",
          "  Platform:4",
          '  api["REST API"]:2',
          '  auth["Auth Module"]:1',
          '  billing["Billing Module"]:1',
          "",
          "  space:4",
          "",
          "  Workers:4",
          '  emails["Email Worker"]:1',
          '  indexer["Search Indexer"]:2',
          '  scheduler["Cron Jobs"]:1',
        ]),
      ),
      cursor: Object.freeze({ anchor: "Client" }),
      priority: 190,
      advanced: true,
    },
    {
      id: "diagram.packet",
      title: "Packet Diagram",
      category: "Diagram",
      description: "Insert a network packet layout diagram.",
      aliases: Object.freeze(["packet", "network", "protocol", "header"]),
      template: fence(
        "mermaid",
        lines([
          "packet-beta",
          '  0-3: "Version"',
          '  4-7: "Header Length"',
          '  8-15: "Service Type"',
          '  16-31: "Total Length"',
          '  32-47: "Identification"',
          '  48-50: "Flags"',
          '  51-63: "Fragment Offset"',
          '  64-71: "TTL"',
          '  72-79: "Protocol"',
          '  80-95: "Header Checksum"',
          '  96-127: "Source Address"',
          '  128-159: "Destination Address"',
        ]),
      ),
      cursor: Object.freeze({ anchor: "Version" }),
      priority: 200,
      advanced: true,
    },
    {
      id: "diagram.journey",
      title: "User Journey",
      category: "Diagram",
      description: "Insert a user experience journey map.",
      aliases: Object.freeze(["journey", "ux", "customer journey", "experience"]),
      template: fence(
        "mermaid",
        lines([
          "journey",
          "  title New User Activation",
          "",
          "  section Arrival",
          "    Land on homepage: 4: Visitor",
          "    Watch product demo: 5: Visitor",
          "",
          "  section Signup",
          "    Create account: 4: Visitor",
          "    Confirm email: 3: Visitor, System",
          "",
          "  section Setup",
          "    Import first file: 5: User",
          "    Configure workspace: 4: User",
          "",
          "  section Success",
          "    Invite teammate: 4: User",
          "    Share first output: 5: User",
        ]),
      ),
      cursor: Object.freeze({ anchor: "New User Activation" }),
      priority: 210,
      advanced: true,
    },
    {
      id: "diagram.requirement",
      title: "Requirement Diagram",
      category: "Diagram",
      description: "Insert a requirement relationship diagram.",
      aliases: Object.freeze(["requirements", "req", "traceability", "satisfies"]),
      template: fence(
        "mermaid",
        lines([
          "requirementDiagram",
          "",
          "  requirement ExportMarkdown {",
          '    id: "REQ-001"',
          '    text: "The editor shall allow users to export notes as Markdown files"',
          "    risk: Medium",
          "    verifymethod: Test",
          "  }",
          "",
          "  requirement PreserveFormatting {",
          '    id: "REQ-002"',
          '    text: "Exported content shall preserve headings, links, and code blocks"',
          "    risk: Medium",
          "    verifymethod: Inspection",
          "  }",
          "",
          "  element editor {",
          '    type: "component"',
          '    docref: "editor-module"',
          "  }",
          "",
          "  element export_service {",
          '    type: "service"',
          '    docref: "export-service"',
          "  }",
          "",
          "  editor - satisfies -> ExportMarkdown",
          "  export_service - satisfies -> PreserveFormatting",
          "  ExportMarkdown - refines -> PreserveFormatting",
        ]),
      ),
      cursor: Object.freeze({ anchor: "ExportMarkdown" }),
      priority: 220,
      advanced: true,
    },
    {
      id: "diagram.radar",
      title: "Radar Chart",
      category: "Diagram",
      description: "Insert a multi-axis comparison chart.",
      aliases: Object.freeze(["radar", "comparison", "scorecard", "capability"]),
      template: fence(
        "mermaid",
        lines([
          "radar-beta",
          "  axis usability, speed, security, extensibility, documentation",
          "  curve current {3, 4, 3, 2, 3}",
          "  curve target {5, 5, 4, 4, 5}",
        ]),
      ),
      cursor: Object.freeze({ anchor: "usability" }),
      priority: 230,
      advanced: true,
    },
    {
      id: "table.basic",
      title: "Table",
      category: "Table",
      description: "Insert a simple Markdown table.",
      aliases: Object.freeze(["grid", "columns", "rows"]),
      template: lines([
        "| Column A | Column B | Column C |",
        "| --- | --- | --- |",
        "| Value | Value | Value |",
      ]),
      cursor: Object.freeze({ anchor: "Column A" }),
      priority: 300,
      advanced: false,
    },
    {
      id: "callout.note",
      title: "Callout",
      category: "Callout",
      description: "Insert a Markdown note callout.",
      aliases: Object.freeze(["note", "alert", "tip", "warning"]),
      template: lines([
        "> [!NOTE]",
        "> Note title",
        "> Add useful context here.",
      ]),
      cursor: Object.freeze({ anchor: "Note title" }),
      priority: 310,
      advanced: false,
    },
    {
      id: "code.generic",
      title: "Code Block",
      category: "Code Block",
      description: "Insert a fenced code block.",
      aliases: Object.freeze(["code", "fence", "snippet"]),
      template: fence("text", "// Write code here"),
      cursor: Object.freeze({ anchor: "Write code here" }),
      priority: 320,
      advanced: false,
    },
    {
      id: "checklist.basic",
      title: "Checklist",
      category: "Checklist",
      description: "Insert a task checklist.",
      aliases: Object.freeze(["tasks", "todo", "checkbox", "action items"]),
      template: lines([
        "- [ ] First task",
        "- [ ] Second task",
        "- [ ] Third task",
      ]),
      cursor: Object.freeze({ anchor: "First task" }),
      priority: 330,
      advanced: false,
    },
    {
      id: "divider.horizontal",
      title: "Divider",
      category: "Divider",
      description: "Insert a horizontal divider.",
      aliases: Object.freeze(["rule", "hr", "separator", "line"]),
      template: "---",
      cursor: Object.freeze({ placement: "end" }),
      priority: 340,
      advanced: false,
    },
  ]);

  const commandById = new Map(
    visualBlockCommands.map(function (command) {
      return [command.id, command];
    }),
  );

  function getVisualBlockCommands() {
    return visualBlockCommands.slice();
  }

  function getVisualBlockCommandById(id) {
    return commandById.get(String(id || "")) || null;
  }

  function normalizeSearchValue(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function tokenizeQuery(query) {
    const normalized = normalizeSearchValue(query);
    return normalized ? normalized.split(/\s+/) : [];
  }

  function fuzzyContains(haystack, needle) {
    if (!needle) return true;
    let offset = 0;
    for (let i = 0; i < needle.length; i += 1) {
      offset = haystack.indexOf(needle[i], offset);
      if (offset === -1) return false;
      offset += 1;
    }
    return true;
  }

  function getCommandSearchFields(command) {
    const aliases = Array.isArray(command.aliases) ? command.aliases : [];
    return [
      { value: command.title, weight: 50 },
      { value: aliases.join(" "), weight: 44 },
      { value: command.category, weight: 32 },
      { value: command.description, weight: 22 },
    ];
  }

  function scoreField(field, token) {
    const value = normalizeSearchValue(field.value);
    if (!value) return 0;
    if (value === token) return field.weight + 36;
    if (value.startsWith(token)) return field.weight + 28;
    if (value.split(/\s+/).some(function (part) {
      return part.startsWith(token);
    })) {
      return field.weight + 18;
    }
    if (value.includes(token)) return field.weight + 10;
    if (token.length >= 4 && fuzzyContains(value, token)) return field.weight;
    return 0;
  }

  function scoreVisualBlockCommand(command, query) {
    const tokens = tokenizeQuery(query);
    if (!tokens.length) return 1;

    const fields = getCommandSearchFields(command);
    let total = 0;
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      let tokenScore = 0;
      for (let j = 0; j < fields.length; j += 1) {
        tokenScore = Math.max(tokenScore, scoreField(fields[j], token));
      }
      if (!tokenScore) return 0;
      total += tokenScore;
    }
    return total;
  }

  function getCategoryRank(category) {
    const index = VISUAL_BLOCK_CATEGORY_ORDER.indexOf(category);
    return index === -1 ? VISUAL_BLOCK_CATEGORY_ORDER.length : index;
  }

  function compareVisualBlockCommands(a, b, query) {
    const hasQuery = tokenizeQuery(query).length > 0;
    if (hasQuery) {
      const scoreDelta =
        scoreVisualBlockCommand(b, query) - scoreVisualBlockCommand(a, query);
      if (scoreDelta) return scoreDelta;
    }

    const categoryDelta =
      getCategoryRank(a.category) - getCategoryRank(b.category);
    if (categoryDelta) return categoryDelta;

    const priorityDelta = (a.priority || 999) - (b.priority || 999);
    if (priorityDelta) return priorityDelta;

    return String(a.title).localeCompare(String(b.title));
  }

  function filterVisualBlockCommands(query, options) {
    const opts = options || {};
    const commands = Array.isArray(opts.commands)
      ? opts.commands
      : visualBlockCommands;
    const tokens = tokenizeQuery(query);
    const hasQuery = tokens.length > 0;
    const includeAdvanced = Boolean(opts.includeAdvanced);

    return commands
      .filter(function (command) {
        if (!hasQuery && command.advanced && !includeAdvanced) return false;
        if (!hasQuery) return true;
        return scoreVisualBlockCommand(command, query) > 0;
      })
      .sort(function (a, b) {
        return compareVisualBlockCommands(a, b, query);
      });
  }

  function getVisualBlockCommandSections(commands, query, options) {
    const list = Array.isArray(commands) ? commands : [];
    const opts = options || {};
    const hasQuery = tokenizeQuery(query).length > 0;
    const groupAdvancedDiagrams =
      hasQuery || Boolean(opts.groupAdvancedDiagrams);
    const byTitle = new Map();

    list.forEach(function (command) {
      let title = command.category;
      if (
        groupAdvancedDiagrams &&
        command.category === "Diagram" &&
        command.advanced
      ) {
        title = "More diagrams";
      }
      if (!byTitle.has(title)) {
        byTitle.set(title, []);
      }
      byTitle.get(title).push(command);
    });

    const sectionOrder = VISUAL_BLOCK_CATEGORY_ORDER.flatMap(function (title) {
      return title === "Diagram" ? [title, "More diagrams"] : [title];
    });
    return sectionOrder
      .filter(function (title) {
        return byTitle.has(title);
      })
      .map(function (title) {
        return {
          title: title,
          commands: byTitle.get(title),
        };
      });
  }

  function getVisualBlockDisplayCommands(commands, query, options) {
    const sections = getVisualBlockCommandSections(commands, query, options);
    const displayCommands = [];
    sections.forEach(function (section) {
      section.commands.forEach(function (command) {
        displayCommands.push(command);
      });
    });
    return displayCommands;
  }

  function getSlashQueryContext(value, selectionStart, selectionEnd) {
    const text = String(value || "");
    const start = Number(selectionStart);
    const end =
      typeof selectionEnd === "number" ? Number(selectionEnd) : Number(start);
    if (!Number.isFinite(start) || start < 0) return null;
    if (start !== end) return null;

    const clampedStart = Math.max(0, Math.min(text.length, start));
    const lineStart = text.lastIndexOf("\n", clampedStart - 1) + 1;
    const segment = text.slice(lineStart, clampedStart);
    const slashIndex = segment.lastIndexOf("/");
    if (slashIndex === -1) return null;

    const slashStart = lineStart + slashIndex;
    const beforeSlash = slashStart > 0 ? text[slashStart - 1] : "";
    if (beforeSlash && !/\s/.test(beforeSlash)) return null;

    return {
      start: slashStart,
      end: clampedStart,
      query: text.slice(slashStart + 1, clampedStart),
    };
  }

  function getVisualBlockMenuState(input) {
    const source = input && typeof input === "object" ? input : {};
    if (source.isEditMode === false) {
      return { open: false, context: null, commands: [], activeIndex: 0 };
    }

    const context = getSlashQueryContext(
      source.value || "",
      source.selectionStart || 0,
      typeof source.selectionEnd === "number"
        ? source.selectionEnd
        : source.selectionStart || 0,
    );
    if (!context) {
      return { open: false, context: null, commands: [], activeIndex: 0 };
    }

    const commands = filterVisualBlockCommands(context.query);
    return {
      open: true,
      context: context,
      commands: commands,
      activeIndex: 0,
    };
  }

  function reduceVisualBlockMenuKey(state, key, itemCount) {
    const source = state && typeof state === "object" ? state : {};
    const open = Boolean(source.open);
    const count = Math.max(0, Number(itemCount) || 0);
    const activeIndex = Math.max(0, Number(source.activeIndex) || 0);

    if (key === "Escape") {
      return Object.assign({}, source, {
        open: false,
        activeIndex: activeIndex,
        action: "close",
      });
    }

    if (!open) {
      return Object.assign({}, source, { action: "none" });
    }

    if (key === "ArrowDown") {
      return Object.assign({}, source, {
        activeIndex: count ? (activeIndex + 1) % count : 0,
        action: "navigate",
      });
    }

    if (key === "ArrowUp") {
      return Object.assign({}, source, {
        activeIndex: count ? (activeIndex - 1 + count) % count : 0,
        action: "navigate",
      });
    }

    if (key === "Enter") {
      return Object.assign({}, source, {
        activeIndex: activeIndex,
        action: count ? "insert" : "none",
      });
    }

    return Object.assign({}, source, { action: "none" });
  }

  function findNth(value, search, occurrence) {
    const target = String(search || "");
    if (!target) return -1;
    const wanted = Math.max(1, Number(occurrence) || 1);
    let index = -1;
    let cursor = 0;
    for (let count = 0; count < wanted; count += 1) {
      index = value.indexOf(target, cursor);
      if (index === -1) return -1;
      cursor = index + target.length;
    }
    return index;
  }

  function getTemplateCursorRange(command) {
    const template = String(command && command.template ? command.template : "");
    const cursor = command && command.cursor ? command.cursor : {};
    if (cursor.placement === "end") {
      return { start: template.length, end: template.length };
    }

    if (cursor.anchor) {
      const index = findNth(template, cursor.anchor, cursor.occurrence);
      if (index !== -1) {
        const shouldSelect = cursor.select !== false;
        return {
          start: index,
          end: shouldSelect ? index + String(cursor.anchor).length : index,
        };
      }
    }

    const firstLineEnd = template.indexOf("\n");
    const start = firstLineEnd === -1 ? template.length : firstLineEnd + 1;
    return { start: start, end: start };
  }

  function createVisualBlockInsertion(value, start, end, commandOrId) {
    const text = String(value || "");
    const command =
      typeof commandOrId === "string"
        ? getVisualBlockCommandById(commandOrId)
        : commandOrId;
    if (!command || typeof command.template !== "string") {
      throw new Error("Unknown visual block command.");
    }

    const rawStart = Math.max(0, Math.min(text.length, Number(start) || 0));
    const rawEnd = Math.max(rawStart, Math.min(text.length, Number(end) || 0));
    const lineStart = text.lastIndexOf("\n", rawStart - 1) + 1;
    const prefixOnLine = text.slice(lineStart, rawStart);
    const needsLeadingBreak =
      rawStart > 0 && text[rawStart - 1] !== "\n" && prefixOnLine.trim().length > 0;
    const needsTrailingBreak = rawEnd < text.length && text[rawEnd] !== "\n";
    const leading = needsLeadingBreak ? "\n\n" : "";
    const trailing = needsTrailingBreak ? "\n\n" : "";
    const cursor = getTemplateCursorRange(command);
    const replacement = leading + command.template + trailing;
    const nextValue =
      text.slice(0, rawStart) + replacement + text.slice(rawEnd);
    const selectionStart = rawStart + leading.length + cursor.start;
    const selectionEnd = rawStart + leading.length + cursor.end;

    return {
      value: nextValue,
      replacement: replacement,
      selectionStart: selectionStart,
      selectionEnd: selectionEnd,
    };
  }

  return {
    COMMON_DIAGRAM_IDS: COMMON_DIAGRAM_IDS,
    VISUAL_BLOCK_CATEGORY_ORDER: VISUAL_BLOCK_CATEGORY_ORDER,
    visualBlockCommands: visualBlockCommands,
    createVisualBlockInsertion: createVisualBlockInsertion,
    filterVisualBlockCommands: filterVisualBlockCommands,
    getSlashQueryContext: getSlashQueryContext,
    getTemplateCursorRange: getTemplateCursorRange,
    getVisualBlockCommandById: getVisualBlockCommandById,
    getVisualBlockDisplayCommands: getVisualBlockDisplayCommands,
    getVisualBlockCommandSections: getVisualBlockCommandSections,
    getVisualBlockCommands: getVisualBlockCommands,
    getVisualBlockMenuState: getVisualBlockMenuState,
    normalizeSearchValue: normalizeSearchValue,
    reduceVisualBlockMenuKey: reduceVisualBlockMenuKey,
    scoreVisualBlockCommand: scoreVisualBlockCommand,
  };
});
