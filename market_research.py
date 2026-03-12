from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

client = genai.Client()

grounding_tool = types.Tool(
    google_search=types.GoogleSearch()
)

config = types.GenerateContentConfig(
    tools=[grounding_tool]
)


def generate_market_research(summary, user_goal):
    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=f"""
    # SOW Market Research Prompt — Fuel Management, Control & Clearing (2026-2030)

> **Purpose:** This prompt drives comprehensive market research to inform the revision of the Ministry of Defense's fuel management, control, and clearing SOW. It is consumed by three research channels: internal document analysis, Gemini deep research, and Google Search.

---

## Section 1: Document Summary

The following is a summary of the original document being revised. It provides the full context — domain, sector, country, ordering entity, services, technical details, SLAs, and structure — that the research must be grounded in.

{summary}

## Section 2: User Goal

The following is the user's stated goal for the document revision. It defines what the new document should achieve, the target time period, and any specific priorities.

{user_goal}

## Section 3: Market Research Instructions

You are a senior procurement analyst and market research specialist. You have been given:
- **Section 1** — a detailed summary of an existing government SOW/tender document
- **Section 2** — the user's goal for revising that document

Your task is to conduct a comprehensive, multi-channel market research that will provide the insights needed to write a new version of this document that is market-relevant, feasible, and ambitious.

**Before you begin, extract the following from Sections 1 and 2** (do not ask the user — infer from the text):
- The **domain and sub-domains** (what industry/services does the document cover?)
- The **sector** (defense, public sector, healthcare, etc.)
- The **country and jurisdiction** (who is the ordering entity and where?)
- The **key services and goods** being procured (list them)
- The **known vendors and market players** (mentioned or implied)
- The **relevant regulatory bodies** (mentioned or implied)
- The **technical standards and protocols** mentioned (e.g., FTPS, XSD, RFID)
- The **SLAs and performance metrics** specified
- The **original document date** vs. the **target period** for the new document
- The **language(s)** needed for local-context searches

Use all of the above to contextualize every research query and finding. Do not produce generic results — every output must be grounded in the specific document and goal.

---

### 3.1 Research Objectives

Organize your research around these seven themes:

#### A. Market Landscape & Structure
1. What is the current market overview for the services/goods described in the document — in the relevant country and globally?
2. Is the market concentrated (monopoly/oligopoly) or fragmented? Who are the dominant players?
3. Who are the potential vendors that can deliver the full scope of services described? Are there new entrants or disruptors since the original document was written?
4. What are the typical contract structures, durations, and pricing models for comparable government procurements in this domain?
5. What role do international players have — could they realistically participate in this tender?

#### B. Benchmark: How Other Governments Procure Similar Services
1. How do comparable government organizations in other countries (same sector) structure their tenders for similar services?
2. What requirements, SLAs, and technical standards do they specify?
3. Are there publicly available tender documents or procurement frameworks we can reference as benchmarks?
4. What lessons can be learned from their procurement processes — successes and failures?
5. What cybersecurity and data classification requirements do comparable organizations impose?

#### C. Benchmark: Same-Country Government Internal Practices
1. How do other government entities in the same country procure the same or related services?
2. Have any government tenders in this domain been updated recently (last 3 years)? What changed?
3. What are the government procurement authority's current framework agreements or guidelines relevant to this domain?
4. Are there relevant state comptroller / audit body reports or recommendations?
5. How is the government handling relevant technology transitions (digitization, green energy, etc.) in procurement?

#### D. Regulatory & Compliance Landscape
1. What are the current and upcoming regulations affecting this domain in the relevant jurisdiction?
2. What international standards (ISO, NIST, IEEE, etc.) are relevant?
3. What cybersecurity and data protection requirements apply (national directives, sector-specific regulations)?
4. Are there environmental/sustainability regulations that impact the scope (emissions, green procurement, energy transition)?
5. What financial/payment/clearing regulations affect the services (if applicable)?
6. What defense/security classification requirements apply (if defense sector)?
7. What accessibility requirements apply to digital services and applications?
8. What regulatory changes are expected during the target period that should be proactively addressed?

#### E. Technology Trends & Best Practices
1. What are the current best practices and state-of-the-art technologies for the services described in the document?
2. What technology shifts have occurred since the original document was written that make parts of it obsolete?
3. What emerging technologies should the new document anticipate or require (AI/ML, IoT, cloud, etc.)?
4. What are the current industry-standard integration patterns (APIs, real-time streaming vs. batch, cloud-native)?
5. What are the modern standards for cybersecurity architecture, disaster recovery, and business continuity in this domain?
6. How have SLA standards evolved since the original document?
7. What reporting, analytics, and dashboard capabilities are now standard vs. what the original document specified?

#### F. Feasibility & Market Readiness
1. Can the current vendor market realistically deliver the full scope of services described? Where are the gaps?
2. Which original requirements are now trivial/commodity — meaning the bar should be raised?
3. Which original requirements were ambitious then but are standard expectations now?
4. What new capabilities exist in the market that the original document didn't ask for — and should they be added?
5. Are the original SLAs still appropriate, or should they be tightened based on current market capabilities?
6. What is a realistic timeline for vendors to implement updated requirements?

#### G. Risk & Opportunity Analysis
1. What are the key risks of keeping the document as-is for the new target period (technology, security, regulatory, operational)?
2. What market opportunities does the original document fail to capture?
3. What are the risks of over-specifying requirements (limiting competition, inflating cost, excluding capable vendors)?
4. What are the risks of under-specifying requirements (poor service, vendor lock-in, security gaps, missing capabilities)?

---

### 3.2 Research Channels

#### Channel 1: Internal Document Analysis
**Source:** Existing files in the project repository and knowledge base.

**Instructions:**
- Search for previously analyzed SOW/tender documents, vendor evaluations, internal memos, or lessons learned in the same domain
- Look for historical data on vendor performance, contract issues, or audit findings
- Identify internal policy documents, security standards, or procurement guidelines that constrain the new document
- Cross-reference with any PRD, SOW, RFI, comparison tables, or strategic planning documents already produced

**Derive search terms from Section 1** — use domain keywords, vendor names, system names, regulatory references, and technical terms in both the document's original language and English.

#### Channel 2: Gemini Deep Research
**Source:** Gemini (Google AI) deep research capability.

**Instructions:**
Conduct thorough, multi-layered research across all seven objectives. Prioritize:
- Industry analyst reports (Gartner, Frost & Sullivan, McKinsey, Deloitte, domain-specific)
- Government procurement databases and published tenders (same country + international comparables)
- Regulatory body publications and policy documents
- Technology vendor whitepapers and case studies
- Sector-specific logistics / operations case studies

**Generate 15-25 research queries** derived from Section 1, including:
- `[domain] government tender requirements [target period] best practices`
- `[domain] market landscape [country] vendors competitive analysis`
- `[domain] technology trends [current year] digital transformation`
- `[domain] SLA benchmarks government contracts`
- `[domain] cybersecurity requirements government [country]`
- `[domain] regulation changes [country] [target period]`
- `[sector] procurement modernization [country] lessons learned`
- `[sub-domains] industry standards ISO certification requirements`
- `[known vendors] capabilities market share [country]`
- `[domain] [country] government audit findings recommendations`
- Equivalent queries in the document's original language for local regulatory and tender context
- Queries targeting specific comparable organizations identified in Section 1

#### Channel 3: Google Search (Web Research)
**Source:** Live web search for the most current information.

**Instructions:**
Focus on the freshest data available:
- Recently published tenders (last 2 years) in this domain — domestic and international
- News about vendor mergers, acquisitions, partnerships, or new market entrants
- Recent regulatory announcements, draft legislation, or policy changes
- Conference presentations, webinars, or expert commentary on modernization in this domain
- Published case studies of successful implementations

**Generate 15-20 search queries**, including:
- `site:` searches on relevant government procurement portals (domestic)
- Vendor name + government contract + domain searches
- International benchmark tenders (US DoD, UK MoD, NATO, EU, Australia, or sector equivalents)
- Searches in the document's original language for local tender and regulatory context
- Market size and forecast queries for the target period

---

### 3.3 Expected Output Structure

#### Part I: Executive Summary
- 1-2 page overview of key findings across all channels
- Top 5 insights that must influence the new document
- Top 5 risks of not updating

#### Part II: Market Landscape Report
- Market structure (concentration, key players, market size)
- Vendor capability matrix (vendor x required capability from Section 1)
- International player relevance assessment
- Market trends and forecast for target period

#### Part III: Benchmark Analysis
- International government procurement benchmarks (same sector)
- Same-country government internal benchmarks
- Comparison table: original document requirements vs. current market standard vs. recommended

#### Part IV: Regulatory & Compliance Update
- Current requirements
- Upcoming changes during target period
- Gap analysis: original document vs. current regulatory requirements

#### Part V: Technology Assessment
- Technology evolution since original document date
- Recommended technology updates for the target period
- Obsolescence risks in the original document

#### Part VI: Feasibility Assessment
- Requirements to **raise** (market can easily exceed current ask)
- Requirements to **keep realistic** (market may struggle or need phased approach)
- Requirements to **add** (market offers capabilities the original didn't ask for)

#### Part VII: Insights & Recommended Actions

| # | Insight | Source | Affected Section(s) | Recommended Action | Priority |
|---|---------|--------|-------------------|-------------------|----------|
| 1 | ... | ... | ... | ... | High/Med/Low |

#### Appendix A: Research Sources
Full list of sources with URLs and access dates.

#### Appendix B: Vendor Profiles
Brief profiles of key vendors identified.

#### Appendix C: Regulatory Reference List
Links to relevant regulations, standards, and guidelines.

#### Appendix D: Comparable Tender Documents
Links or summaries of comparable government tenders found.

---

### 3.4 Quality Criteria

The research output will be evaluated on:
- **Comprehensiveness** — all seven research themes (A-G) addressed with specific findings
- **Relevance** — findings are specific to the domain, sector, and jurisdiction from Section 1, not generic
- **Recency** — sources from the last 2-3 years where possible
- **Actionability** — every insight maps to a specific section or requirement in the original document
- **Balance** — both vendor-friendly feasibility AND buyer-ambitious requirements considered
- **Traceability** — every claim is linked to a verifiable source
    """,
        config=config,
    )
    return response.text or ""


def translate_market_research_to_hebrew(text):
    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=f"""Translate the following text to Hebrew, preserving formatting and structure exactly. Do not add or remove any content, and do not provide any explanations — only the translated text.
{text}""")
    return response.text or ""


def run_market_research(summary, user_goal):
    english_text = generate_market_research(summary, user_goal)
    return translate_market_research_to_hebrew(english_text)
