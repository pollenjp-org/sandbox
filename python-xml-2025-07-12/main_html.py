from html.parser import HTMLParser


class TextExtractor(HTMLParser):
    """ChatGPT: https://chatgpt.com/c/687dd0fa-3040-8002-bedb-b9b09cf71394

    - script タグ内のテキストはスキップする
    """

    def __init__(self):
        super().__init__()
        self.text_parts = []
        self.skip = False  # script タグ内かどうか

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.skip = True
        elif tag == "br" and not self.skip:
            self.text_parts.append("\n")

    def handle_endtag(self, tag):
        if tag == "script":
            self.skip = False

    def handle_data(self, data):
        if not self.skip:
            stripped = data.strip()
            if stripped:
                self.text_parts.append(stripped)

    def get_text(self):
        return "\n".join(self.text_parts)


def main():
    # get from sample.html
    with open("sample.html", "r", encoding="utf-8") as f:
        html_input = f.read()

    parser = TextExtractor()
    parser.feed(html_input)
    output = parser.get_text()
    print(output.replace("\n", ""))


main()
