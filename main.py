import cv2
import mediapipe as mp
import numpy as np
import threading
import time
import webbrowser
import os
import math
from flask import Flask, render_template, jsonify, send_file
import logging

# === 🔇 静音日志 (只显示重要报错) ===
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

# === ⚙️ Flask 配置 (将模板目录设为当前目录，方便文件管理) ===
app = Flask(__name__, template_folder='.')

# === ⚙️ 游戏 CV 配置 ===
FLUSH_COOLDOWN = 15.0  # 眨眼技能 CD
FLUSH_REQUIRED_TIME = 1.0  # 闭眼需要维持的时间


# === 🌊 滤波器 (让数值更平滑) ===
class SmoothFilter:
    def __init__(self, alpha=0.2):
        self.alpha = alpha
        self.value = 0.0

    def process(self, new_val):
        self.value = self.value * (1 - self.alpha) + new_val * self.alpha
        return self.value


# === 💾 全局状态 (Python -> JS 数据桥梁) ===
game_state = {
    "aim_x": 0.5, "aim_y": 0.5,  # 准星位置 (0.0 - 1.0)
    "head_tilt": 0.0,  # 头部倾斜 (-1.0 - 1.0)
    "is_firing": False,  # 是否开火
    "flush_trigger": False,  # 是否触发系统重置 (大招)
    "flush_cd_progress": 1.0,  # 大招 CD 进度
    "is_charging": False,  # 是否正在闭眼蓄力
    "has_gun": False  # 是否检测到手枪手势
}

# 实例化滤波器
filter_aim_x = SmoothFilter(0.15)
filter_aim_y = SmoothFilter(0.15)
filter_tilt = SmoothFilter(0.1)


# === 👁️ 视觉核心逻辑 (独立线程) ===
def cv_thread_logic():
    global game_state
    last_flush_time = 0
    blink_start_time = None
    last_finger_y = 0
    fire_cooldown = 0

    mp_face = mp.solutions.face_mesh
    mp_hands = mp.solutions.hands

    # 降低置信度阈值以提高 FPS，同时开启 refine_landmarks 获取瞳孔细节
    face_mesh = mp_face.FaceMesh(max_num_faces=1, refine_landmarks=True, min_detection_confidence=0.5)
    hands = mp_hands.Hands(max_num_hands=1, min_detection_confidence=0.5, min_tracking_confidence=0.5)

    cap = cv2.VideoCapture(0)
    # 降低分辨率以提升处理速度，足够 Web 交互使用
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    print("🟢 DAVID MARTINEZ SYSTEM: ONLINE (CV Thread Running)")

    while True:
        success, img = cap.read()
        if not success:
            time.sleep(0.1)
            continue

        # 镜像翻转，符合镜子直觉
        img = cv2.flip(img, 1)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        h, w, _ = img.shape
        current_time = time.time()

        # --- 1. 面部追踪 (Head & Eyes) ---
        face_results = face_mesh.process(img_rgb)
        tilt_val = 0.0

        if face_results.multi_face_landmarks:
            lms = face_results.multi_face_landmarks[0].landmark

            # A. 头部倾斜计算 (利用左右眼角坐标)
            left_eye = lms[33]
            right_eye = lms[263]
            dx = right_eye.x - left_eye.x
            dy = right_eye.y - left_eye.y
            angle = math.atan2(dy, dx)
            degree = math.degrees(angle)
            # 归一化倾斜角度
            tilt_val = np.clip(degree / 20.0, -1.0, 1.0)

            # B. 闭眼检测 (System Reboot 机制)
            # 计算上下眼睑距离
            left_blink = abs(lms[159].y - lms[145].y)
            right_blink = abs(lms[386].y - lms[374].y)
            is_blinking = (left_blink + right_blink) / 2 < 0.008

            # C. 技能 CD 与 触发逻辑
            cd_progress = min((current_time - last_flush_time) / FLUSH_COOLDOWN, 1.0)
            game_state["flush_cd_progress"] = cd_progress

            if is_blinking and cd_progress >= 1.0:
                if blink_start_time is None:
                    blink_start_time = current_time

                game_state["is_charging"] = True

                # 如果闭眼时间达标
                if current_time - blink_start_time >= FLUSH_REQUIRED_TIME:
                    game_state["flush_trigger"] = True
                    last_flush_time = current_time
                    blink_start_time = None
                    print("💊 SYSTEM REBOOT TRIGGERED")
                else:
                    game_state["flush_trigger"] = False
            else:
                blink_start_time = None
                game_state["is_charging"] = False
                game_state["flush_trigger"] = False

        game_state["head_tilt"] = float(filter_tilt.process(tilt_val))

        # --- 2. 手势追踪 (Aim & Fire) ---
        hand_results = hands.process(img_rgb)
        has_gun = False
        is_firing = False

        if hand_results.multi_hand_landmarks:
            h_lms = hand_results.multi_hand_landmarks[0].landmark

            # A. 瞄准 (食指指尖坐标)
            raw_aim_x = h_lms[8].x
            raw_aim_y = h_lms[8].y
            game_state["aim_x"] = float(filter_aim_x.process(raw_aim_x))
            game_state["aim_y"] = float(filter_aim_y.process(raw_aim_y))

            has_gun = True

            # B. 射击动作判定 (检测食指指尖的 Y 轴瞬时速度)
            curr_y = h_lms[8].y * h
            velocity = curr_y - last_finger_y
            last_finger_y = curr_y

            # 速度阈值 10，并增加 5 帧冷却防止连发误判
            if abs(velocity) > 10 and fire_cooldown <= 0:
                is_firing = True
                fire_cooldown = 5

            if fire_cooldown > 0:
                fire_cooldown -= 1

        game_state["has_gun"] = has_gun
        game_state["is_firing"] = is_firing

        # 稍微休眠释放 CPU
        time.sleep(0.01)


# === 🌐 Flask 路由 ===

@app.route('/')
def index():
    # 直接读取当前目录下的 index.html
    return render_template('index.html')


@app.route('/api/status')
def get_status():
    # 前端轮询此接口获取最新数据
    return jsonify(game_state)


# --- 资源文件路由 (确保图片/音频放在同级目录) ---
@app.route('/city.jpg')
def get_city_bg():
    if os.path.exists("city.jpg"): return send_file("city.jpg", mimetype="image/jpeg")
    return "Not Found", 404


@app.route('/road.png')
def get_road_img():
    if os.path.exists("road.png"): return send_file("road.png", mimetype="image/png")
    return "Not Found", 404


@app.route('/tree.png')
def get_tree_img():
    if os.path.exists("tree.png"): return send_file("tree.png", mimetype="image/png")
    return "Not Found", 404


@app.route('/ground.png')
def get_ground_img():
    if os.path.exists("ground.png"): return send_file("ground.png", mimetype="image/png")
    return "Not Found", 404


@app.route('/plain.png')
def get_enemy_img():
    if os.path.exists("plain.png"): return send_file("plain.png", mimetype="image/png")
    return "Not Found", 404


# === 在 main.py 中添加这个新路由 ===
@app.route('/moon.png')
def get_moon_img():
    # 确保你的 moon.png 图片文件就在 main.py 同级目录下
    if os.path.exists("moon.png"):
        return send_file("moon.png", mimetype="image/png")
    return "Not Found", 404


@app.route('/audio/bgm')
def stream_bgm():
    mp3_path = "I Really Want to Stay at Your House.mp3"
    if os.path.exists(mp3_path): return send_file(mp3_path, mimetype="audio/mpeg")
    return "File not found", 404


# === 在 main.py 的路由区域添加 ===

@app.route('/audio/laboon')
def stream_menu_bgm():
    # 确保 laboon.mp3 在当前目录下
    mp3_path = "laboon.mp3"
    if os.path.exists(mp3_path):
        return send_file(mp3_path, mimetype="audio/mpeg")
    return "File not found", 404


# === 🚀 主程序入口 ===
if __name__ == '__main__':
    # 1. 启动 CV 线程
    t = threading.Thread(target=cv_thread_logic)
    t.daemon = True  # 设为守护线程，主程序退出时自动结束
    t.start()


    # 2. 自动打开浏览器
    def open_browser():
        time.sleep(1.5)
        webbrowser.open("http://127.0.0.1:5000")


    threading.Thread(target=open_browser).start()

    # 3. 启动 Web 服务器
    print("🌐 Server starting at http://127.0.0.1:5000")
    app.run(host='0.0.0.0', port=5000, debug=False)