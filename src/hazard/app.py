from flask import Flask, render_template, request, jsonify, send_file
import json
import io

app = Flask(__name__)

_store = {"state": None}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/save", methods=["POST"])
def save_state():
    _store["state"] = request.get_json()
    return jsonify({"ok": True})


@app.route("/api/load", methods=["GET"])
def load_state():
    if _store["state"] is None:
        return jsonify({"ok": False, "state": None})
    return jsonify({"ok": True, "state": _store["state"]})


@app.route("/api/export", methods=["POST"])
def export_json():
    data = request.get_json()
    buf = io.BytesIO(json.dumps(data, indent=2).encode())
    buf.seek(0)
    return send_file(
        buf,
        mimetype="application/json",
        as_attachment=True,
        download_name="hazard-project.json",
    )


def main():
    app.run(debug=True, host="0.0.0.0", port=5000)


if __name__ == "__main__":
    main()
