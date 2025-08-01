import xml.etree.ElementTree as ET


def extract_all_text_from_xml(xml_string):
    root = ET.fromstring(xml_string)
    texts = []

    def recurse(node):
        # 現在のノードのテキスト
        if node.text and node.text.strip():
            texts.append(node.text.strip())
        # 子ノードを再帰的に処理
        for child in node:
            recurse(child)
        # タグ閉じ後の tail（例えば <tag>text</tag>tail）
        if node.tail and node.tail.strip():
            texts.append(node.tail.strip())

    recurse(root)
    return texts


def main():
    with open("sample.xml", "r", encoding="utf-8") as f:
        xml_data = f.read()

    result = extract_all_text_from_xml(xml_data)
    # print("\n".join(result))
    print("".join(result))


main()
