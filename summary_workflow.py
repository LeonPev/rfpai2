import json

from dotenv import load_dotenv
from split_doc import split_doc_to_sections
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


def ask_gemini(prompt):
    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=prompt,
        config=config,
    )
    return response.text


def extract_json(text):
    text = text.strip()

    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]

    text = text.strip()

    try:
        return json.loads(text)
    except Exception:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            return json.loads(text[start:end + 1])
        raise


def find_missing_sections(section_titles):
    prompt = f"""
You are reviewing a document structure.

Existing section titles:
{json.dumps(section_titles, ensure_ascii=False, indent=2)}

Task:
Suggest missing sections that would improve the document structure and completeness.
Be conservative. Do not invent unnecessary sections.

Return valid JSON only in this format:
{{
  "missing_sections": ["section name 1", "section name 2"],
  "reasoning": "short explanation"
}}
"""
    text = ask_gemini(prompt)
    return extract_json(text)


def summarize_section(section):
    prompt = f"""
אתה יוצר סיכום תמציתי של סעיף אחד במסמך.

כותרת הסעיף:
{section["section_title"]}

טקסט הסעיף:
{section["text"]}

משימה:
יצור סיכום קצר וברור של סעיף זה שלוכד את הנקודות העיקריות והמושגים הראשיים.
הסיכום צריך להיות תמציתי, מקצועי ומתאים לסקירה ניהולית.

החזר JSON בלבד בפורמט הזה:
{{
  "summary": "סיכום תמציתי של הסעיף"
}}
"""
    text = ask_gemini(prompt)
    return extract_json(text)


def process_document_once(doc_path):
    sections = split_doc_to_sections(doc_path)
    table = []

    for section in sections:
        result = summarize_section(section)
        table.append(
            {
                "section_title": section.get("section_title", ""),
                "original_text": section.get("text", ""),
                "summary": result.get("summary", ""),
            }
        )

    return {
        "source_file": doc_path,
        "table": table,
    }


def process_document_stream(doc_path):
    yield {"step": "שלב 1: פיצול המסמך לסעיפים..."}
    # with open("document_summary_res.json", "r") as f:    
    #     res = json.loads(f.read())
    # yield res
    # return    
    sections = split_doc_to_sections(doc_path)
    total = len(sections)
    yield {"step": f"נמצאו {total} סעיפים במסמך"}

    table = []

    for i, section in enumerate(sections, start=1):
        section_text = section["text"]
        char_count = len(section_text)
        section_title = section.get("section_title", f"Section {i}")

        yield {"step": f"מעבד סעיף {i}/{total}: {section_title}"}

        print("=" * 80)
        print(f"processing section {i}/{total}: {section_title}")
        print(f"chars: {char_count}")
        print("section content:")
        # print(section_text)
        print("=" * 80)

        result = summarize_section(section)

        row = {
            "section_title": section_title,
            "original_text": section_text,
            "summary": result.get("summary", "")
        }
        table.append(row)

        yield {"step": f"הושלם סעיף {i}/{total}: {section_title}"}

    final_result = {
        "source_file": doc_path,
        "table": table
    }
    fin_step = {"step": "completed", "result": final_result}
    with open("document_summary_res.json", "w") as f:
        f.write(json.dumps(fin_step, ensure_ascii=False, indent=2)) 
    yield fin_step


def process_document(doc_path):
    return process_document_once(doc_path)


def main():
    doc_path = "uploads/c.docx"
    sections = split_doc_to_sections(doc_path)
    print(json.dumps(sections, ensure_ascii=False, indent=2))

    result = process_document(doc_path)

    with open("output.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"done. wrote output.json")


if __name__ == "__main__":
    main()
