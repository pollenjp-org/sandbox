import streamlit as st


def main():
    st.set_page_config(page_title="Video Uploader", page_icon="🎥", layout="centered")

    st.title("🎥 ビデオアップローダー")
    st.write("動画ファイルをアップロードして再生できます。")

    uploaded_file = st.file_uploader("動画ファイルを選択してください", type=["mp4", "mov", "avi"])

    if uploaded_file is not None:
        st.video(uploaded_file)

        # ファイル情報を表示
        st.info(f"ファイル名: {uploaded_file.name}\nサイズ: {uploaded_file.size / (1024 * 1024):.2f} MB")


if __name__ == "__main__":
    main()
