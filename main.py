from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
import os
import json
import time
import tempfile
from dotenv import load_dotenv
from google import genai
from google.genai import types
from markitdown import MarkItDown
from markdown_pdf import MarkdownPdf, Section
from md2docx_python.src.md2docx_python import markdown_to_word
from doc_workflow import process_document_stream

load_dotenv()

app = Flask(__name__, static_folder='static', static_url_path='')
# Enable CORS for the React frontend
CORS(app)

# Local storage paths
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
CREATED_FOLDER = os.path.join(os.path.dirname(__file__), 'created_files')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(CREATED_FOLDER, exist_ok=True)

@app.route('/')
def serve_index():
    return app.send_static_file('index.html')

@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({"status": "healthy", "service": "RFP API"})

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file parameter"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Empty filename"}), 400
    
    file_path = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(file_path)
    return jsonify({"message": f"File {file.filename} uploaded successfully"}), 200

@app.route('/api/uploads', methods=['GET'])
def list_uploaded_files():
    files = os.listdir(UPLOAD_FOLDER)
    return jsonify({"files": files})

@app.route('/api/uploads/<filename>', methods=['DELETE'])
def delete_uploaded_file(filename):
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return jsonify({"message": "File deleted"}), 200
    return jsonify({"error": "File not found"}), 404

@app.route('/api/convert', methods=['POST'])
def convert_doc():
    data = request.json
    filename = data.get('filename')
    new_filename = data.get('new_filename')
    
    if not filename or not new_filename:
        return jsonify({"error": "Missing filename or new_filename"}), 400
        
    if not new_filename.endswith('.md'):
        new_filename += '.md'
        
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    if not os.path.exists(file_path):
        return jsonify({"error": "Original file not found"}), 404
        
    try:
        if filename.endswith('.docx') or filename.endswith('.doc'):
            md = MarkItDown(enable_plugins=False)
            text = md.convert(file_path)
            md_content = f"# {new_filename.replace('.md', '')}\n\n{text}"
        else:
            with open(file_path, 'r', encoding='utf-8') as f:
                md_content = f.read()
    except Exception as e:
        return jsonify({"error": f"Failed to process docx: {str(e)}"}), 500
        
    # Save the markdown directly to drafts / created_files
    dest_path = os.path.join(CREATED_FOLDER, new_filename)
    with open(dest_path, 'w', encoding='utf-8') as f:
        f.write(md_content)
        
    return jsonify({
        "message": "Converted successfully", 
        "content": md_content,
        "new_filename": new_filename
    }), 200

@app.route('/api/uploads/<filename>', methods=['GET'])
def get_uploaded_file(filename):
    try:
        with open(os.path.join(UPLOAD_FOLDER, filename), 'r', encoding='utf-8') as f:
            content = f.read()
        return jsonify({"content": content})
    except Exception as e:
        return jsonify({"error": str(e)}), 404

@app.route('/api/files', methods=['POST'])
def save_created_file():
    data = request.json
    filename = data.get('filename')
    content = data.get('content')
    output_format = (data.get('output_format') or 'md').lower()

    if not filename or not content:
        return jsonify({"error": "Missing filename or content"}), 400

    if output_format not in {'md', 'pdf', 'docx'}:
        return jsonify({"error": "Invalid output_format"}), 400

    if output_format == 'md' and not filename.endswith('.md'):
        filename += '.md'
    elif output_format == 'pdf' and not filename.endswith('.pdf'):
        filename += '.pdf'
    elif output_format == 'docx' and not filename.endswith('.docx'):
        filename += '.docx'

    file_path = os.path.join(CREATED_FOLDER, filename)

    try:
        if output_format == 'pdf':
            pdf = MarkdownPdf(toc_level=2, optimize=True)
            pdf.meta['title'] = os.path.splitext(filename)[0]
            pdf.add_section(Section(content, root=os.path.dirname(__file__)))
            pdf.save(file_path)
        elif output_format == 'docx':
            with tempfile.NamedTemporaryFile('w', suffix='.md', encoding='utf-8', delete=False) as temp_md:
                temp_md.write(content)
                temp_md_path = temp_md.name
            try:
                markdown_to_word(temp_md_path, file_path)
            finally:
                if os.path.exists(temp_md_path):
                    os.remove(temp_md_path)
        else:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
    except Exception as e:
        return jsonify({"error": f"Failed to save file: {str(e)}"}), 500

    return jsonify({"message": "File saved successfully", "filename": filename}), 200

@app.route('/api/files', methods=['GET'])
def list_created_files():
    files = os.listdir(CREATED_FOLDER)
    return jsonify({"files": files})

@app.route('/api/files/<filename>', methods=['GET'])
def download_created_file(filename):
    return send_from_directory(CREATED_FOLDER, filename, as_attachment=True)

@app.route('/api/improve', methods=['POST'])
def improve_document():
    data = request.json
    filename = data.get('filename')
    print(f"Received request to improve document: {filename}")
    if filename:
        # Check in uploads folder for the original document
        # If frontend sends .md, try to find the corresponding .docx
        if filename.endswith('.md'):
            base_name = filename[:-3]
            if base_name.startswith('new-'):
                base_name = base_name[4:]
            
            file_path = os.path.join(UPLOAD_FOLDER, base_name + '.docx')
            if not os.path.exists(file_path):
                file_path = os.path.join(UPLOAD_FOLDER, base_name + '.doc')
                
            if not os.path.exists(file_path):
                file_path = os.path.join(UPLOAD_FOLDER, filename)
        else:
            file_path = os.path.join(UPLOAD_FOLDER, filename)
            
        if not os.path.exists(file_path):
            return jsonify({"error": "File not found in uploads folder"}), 404
    else:
        return jsonify({"error": "Missing filename parameter. Process_document requires a valid .docx file from uploads."}), 400

    try:
        def generate():
            try:
                for update in process_document_stream(file_path):
                    if update.get("step") == "completed":
                        result = update.get("result") or {}

                        # Transform the payload for backward compatible handling in frontend
                        if "table" in result and "items" not in result:
                            result["items"] = result["table"]

                        yield json.dumps({"step": "completed", "result": result}, ensure_ascii=False) + "\n"
                    else:
                        yield json.dumps({"step": update.get("step", "Processing...")}, ensure_ascii=False) + "\n"
            except Exception as e:
                yield json.dumps({"error": str(e)}, ensure_ascii=False) + "\n"
                
        return Response(generate(), mimetype='application/x-ndjson')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def section_chat_endpoint():
    data = request.json or {}
    user_message = (data.get('message') or '').strip()
    selected_row = data.get('selected_row')
    chat_history = data.get('chat_history') or []

    if not user_message:
        return jsonify({"error": "Missing message"}), 400
    if not selected_row or not isinstance(selected_row, dict):
        return jsonify({"error": "Missing or invalid selected_row"}), 400

    from section_chat import chat_with_section
    result = chat_with_section(user_message, selected_row, chat_history)
    return jsonify(result)


if __name__ == '__main__':
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
