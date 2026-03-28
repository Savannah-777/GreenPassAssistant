import os
import shutil
import cv2
import base64
import requests
import time
from datetime import datetime

# --- 配置信息 ---
# 1. 路径配置
source_root = r'C:\Users\38310\Documents\WeChat Files\wxid_baotvzc5nw6221\FileStorage\Video\2026-03'
target_base = r'D:\绿通归档助手'

#
API_KEY = 'YOUR_API_KEY'
SECRET_KEY = 'YOUR_SECRET_KEY'


def get_access_token():
    """获取百度通行证"""
    url = f"https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id={API_KEY}&client_secret={SECRET_KEY}"
    response = requests.post(url)
    if response.status_code == 200:
        return response.json().get("access_token")
    return None


def identify_plate(video_path, token):
    """截取视频第1秒并识别车牌"""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None

    # 跳到第 1000 毫秒（第1秒），此时画面通常已经稳了
    cap.set(cv2.CAP_PROP_POS_MSEC, 1000)
    success, frame = cap.read()
    cap.release()

    if success:
        # 将图片转为 Base64
        _, buffer = cv2.imencode('.jpg', frame)
        img_base64 = base64.b64encode(buffer).decode('utf-8')

        # 调用百度接口
        ocr_url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/license_plate?access_token={token}"
        data = {"image": img_base64}
        headers = {'Content-Type': 'application/x-www-form-urlencoded'}

        try:
            res = requests.post(ocr_url, data=data, headers=headers)
            result = res.json()
            if 'words_result' in result:
                return result['words_result']['number']
        except:
            pass
    return None


def start_work():
    token = get_access_token()
    if not token:
        print("❌ 百度 AI 初始化失败，请检查网络！")
        return

    if not os.path.exists(target_base): os.makedirs(target_base)

    count = 0
    # 遍历文件夹
    for root, dirs, files in os.walk(source_root):
        for file in files:
            if file.lower().endswith('.mp4'):
                file_path = os.path.join(root, file)

                # 获取时间戳
                dt = datetime.fromtimestamp(os.path.getmtime(file_path))
                time_str = dt.strftime('%H.%M')
                date_folder = dt.strftime('%Y-%m-%d')

                print(f"🔍 正在处理: {file}...")

                # --- 核心识别逻辑 ---
                plate = None

                # 1. 尝试从文件名提取
                if "-" in file:
                    parts = file.replace('.mp4', '').split('-')
                    if parts[0].strip() and len(parts[0]) < 10:
                        plate = parts[0]

                # 2. 如果文件名是乱码，则开启“真·视频识别”
                if not plate:
                    # 等待 2 秒防止微信还没写完文件
                    time.sleep(2)
                    plate = identify_plate(file_path, token)

                # 3. 兜底方案
                if not plate:
                    plate = "手动核对"

                # 执行归档
                final_dir = os.path.join(target_base, date_folder)
                os.makedirs(final_dir, exist_ok=True)

                new_name = f"{plate}-{time_str}.mp4"

                # 检查目标是否已有同名文件，防止覆盖
                target_path = os.path.join(final_dir, new_name)
                if os.path.exists(target_path):
                    new_name = f"{plate}-{time_str}-{int(time.time())}.mp4"

                try:
                    shutil.move(file_path, os.path.join(final_dir, new_name))
                    print(f"✅ 成功归档: {new_name}")
                    count += 1
                except Exception as e:
                    print(f"❌ 移动失败: {e}")

    print(f"\n✨ 任务圆满完成！共处理 {count} 个视频。")


if __name__ == "__main__":
    start_work()