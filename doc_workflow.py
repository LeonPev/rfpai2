import os
import re
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


def improve_section(section):
    prompt = f"""
You are improving one section of a document.

Section title:
{section["section_title"]}

Section text:
{section["text"]}

Task:
Improve this section so it is clearer, more concise, and more modern,
while keeping the original meaning and intent.

Return valid JSON only in this format:
{{
  "improved_text": "rewritten section text",
  "explanation": "what was improved"
}}
"""
    text = ask_gemini(prompt)
    return extract_json(text)


def process_document_stream(doc_path):
    yield {"step": "שלב 1: פיצול המסמך לסעיפים..."}
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

        result = improve_section(section)

        row = {
            "section_title": section_title,
            "original_text": section_text,
            "improved_text": result.get("improved_text", ""),
            "explanation": result.get("explanation", "")
        }
        table.append(row)

        yield {"step": f"הושלם סעיף {i}/{total}: {section_title}"}

    final_result = {
        "source_file": doc_path,
        "table": table
    }

    yield {"step": "completed", "result": final_result}


def process_document(doc_path):
    # return mock for testing
    # return {
    #     "source_file": doc_path,
    #     "table": [
    #         {
    #             "section_title": "הקדמה",
    #             "original_text": "טקסט מקורי של ההקדמה",
    #             "improved_text": "טקסט משופר של ההקדמה",
    #             "explanation": "שיפרתי את הניסוח והבהירות"
    #         },
    #         {
    #             "section_title": "סקירת ספרות",
    #             "original_text": "טקסט מקורי של סקירת הספרות",
    #             "improved_text": "טקסט משופר של סקירת הספרות",
    #             "explanation": "הוספתי מידע עדכני וארגנתי טוב יותר"
    #         }
    #     ]
    # }
    final_result = None
    for update in process_document_stream(doc_path):
        if update.get("step") == "completed":
            final_result = update.get("result")

    return final_result or {
        "source_file": doc_path,
        "table": []
    }


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