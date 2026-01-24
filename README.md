# 🏎️ Cyber Racer (赛博车手) - Python Course Project

> 基于计算机视觉的体感赛车游戏 | Computer Vision based Gesture Control Game
>
> **Nankai University Software Engineering Course Project**

![Python](https://img.shields.io/badge/Python-3.8%2B-blue)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Computer%20Vision-orange)
![Status](https://img.shields.io/badge/Status-Completed-green)

## 📖 项目简介 (Introduction)

这是一个使用 Python 开发的互动式赛车游戏。与传统键盘控制不同，通过捕捉玩家的**头部姿态**和**手势动作**来控制游戏进程。

游戏设计了独特的“赛博精神病”机制和高密度的障碍物挑战，玩家不仅需要通过头部倾斜来驾驶，还需要在危机时刻闭眼“净化”异常状态，甚至通过手势击落敌机。

🔗 **项目仓库**: [https://github.com/1FREEfISH/YiZhiXianYu_python_course-project](https://github.com/1FREEfISH/YiZhiXianYu_python_course-project)

---

## 🎮 游戏机制 (Game Mechanics)

### 1. 核心驾驶 (Driving)
- **头部控制转向**：程序实时捕获玩家摄像头的面部特征。
    - **左转/右转**：通过计算双眼眼角的高度差（Head Tilt），判断玩家头部倾斜方向，从而控制赛车左右移动。

### 2. 积分与障碍 (Scoring & Hazards)
- **生存积分**：游戏开始后，每坚持 **1秒** 获得 **+10分**。
- **高难度障碍**：
    - ⚠️ **注意**：障碍物密度设定较高，部分情况下呈现“必死”局面，强制玩家合理规划技能使用。
    - **撞击惩罚**：每撞到一个障碍物 **扣除 30分**。
    - **视觉干扰 (Bug Window)**：每次撞击会在屏幕上生成一个遮挡视野的 **Bug 弹窗**，模拟系统故障。

### 3. 技能系统：净化 (Purify)
- **触发方式**：闭眼持续 **1秒** 以上。
- **效果**：释放全屏净化，**清空所有当前的 Bug 窗口**（消除异常状态）。
- **冷却时间 (CD)**：**15秒**。

### 4. 终极挑战：赛博精神病 (Cyberpsychosis)
- **触发条件**：当屏幕上积累的 Bug 窗口达到 **10个** 时，系统强制进入“赛博精神病”状态。
- **失败判定**：如果该状态持续超过 **15秒**，游戏直接失败 (Game Over)。
- **空战模式**：
    - 在此状态下，屏幕会出现敌机。
    - **反击手段**：玩家对着摄像头做出 **“打手枪” (Finger Gun)** 的手势。
    - **击杀奖励**：击落一架敌机获得 **+100分**。

### 🏆 胜利条件 (Win Condition)
- 玩家总积分累计达到 **500分** 即视为胜利。

## 👨‍💻 作者 (Author)

**YiZhiXianYu**

* Nankai University, Software Engineering
* GitHub: [@1FREEfISH](https://www.google.com/search?q=https://github.com/1FREEfISH)

---

*Enjoy the Cyber Ride!* 🏁

```
