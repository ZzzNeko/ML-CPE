# Fitness AI Web Game
## เอกสารภาพรวมและแนวทางพัฒนาเกมออกกำลังกายด้วย AI

---

## 1. ภาพรวมโครงการ

โครงการนี้เป็นเกมออกกำลังกายบนเว็บที่ใช้กล้อง Webcam ตรวจจับท่าทางของผู้เล่น และใช้ Machine Learning จำแนกท่าออกกำลังกายขณะยืนแบบเรียลไทม์ จากนั้นนำผลลัพธ์ไปควบคุมตัวละคร ระบบคะแนน ภารกิจ และองค์ประกอบต่าง ๆ ภายในเกม

แนวคิดหลัก:

> ผู้เล่นควบคุมเกมด้วยการออกกำลังกายผ่านกล้อง โดยไม่จำเป็นต้องใช้คีย์บอร์ดหรือจอยเป็นหลัก

เกมจะเน้นท่าออกกำลังกายขณะยืน เช่น

- Standing / Idle
- Arms Up
- Jumping Jack
- High Knees
- Side Step
- Air Punch

---

## 2. เป้าหมายของโครงการ

### 2.1 เป้าหมายหลัก

1. สร้างเกมออกกำลังกายที่เล่นผ่านเว็บเบราว์เซอร์
2. ใช้กล้องในการตรวจจับท่าทางของผู้เล่น
3. ใช้ Machine Learning จำแนกท่าออกกำลังกาย
4. นำผลลัพธ์จาก AI ไปควบคุมเกม
5. มีระบบนับจำนวนครั้งและคำนวณคะแนน
6. ทำให้ผู้เล่นได้รับ Feedback ระหว่างเล่น
7. สามารถพัฒนาและ Deploy ให้เล่นผ่านเว็บไซต์ได้

### 2.2 เป้าหมายด้าน Machine Learning

1. สร้าง Dataset ของท่าออกกำลังกาย
2. ใช้ Pose Estimation แปลงภาพเป็นจุดข้อต่อ
3. สร้าง Feature จากตำแหน่งและมุมของข้อต่อ
4. Train โมเดล Neural Network
5. ใช้ SVM เป็นโมเดลเปรียบเทียบ
6. ประเมินผลด้วย Accuracy, Precision, Recall และ F1-score
7. นำโมเดลไปใช้งานบนเว็บแบบ Real-time

---

## 3. แนวคิดเกม

### ชื่อเกมชั่วคราว

**FitQuest AI**

สามารถเปลี่ยนชื่อภายหลังได้

### แนวเกม

- Fitness Game
- Motion-Control Game
- Adventure Game
- Casual Game
- Educational / Health Promotion Game

### รูปแบบการเล่น

ผู้เล่นเปิดกล้องและยืนอยู่ในพื้นที่ที่กล้องมองเห็นร่างกายได้ชัดเจน เกมจะแสดงคำสั่ง เช่น

- ยกแขน
- ยกเข่า
- ก้าวซ้าย
- ก้าวขวา
- ชกอากาศ
- กระโดดแยกขา

AI จะตรวจจับท่าทางและส่งผลให้เกมทำงาน เช่น

- ตัวละครกระโดด
- ตัวละครหลบสิ่งกีดขวาง
- ตัวละครโจมตี
- เก็บดาวหรือเหรียญ
- เพิ่มคะแนน
- เพิ่ม Combo
- ผ่านภารกิจ

---

## 4. Game Design

### 4.1 โหมดเกม

#### Adventure Mode

ผู้เล่นผจญภัยผ่านด่านต่าง ๆ โดยใช้ท่าออกกำลังกายเพื่อควบคุมตัวละคร

ตัวอย่าง:

- ยกแขนเพื่อเก็บดาว
- ยกเข่าเพื่อหลบสิ่งกีดขวาง
- ก้าวซ้ายหรือขวาเพื่อเก็บเหรียญ
- ชกอากาศเพื่อโจมตีศัตรู

#### Time Challenge

ผู้เล่นต้องทำท่าที่กำหนดภายในเวลาที่กำหนด เช่น 30 หรือ 60 วินาที

ระบบที่เกี่ยวข้อง:

- Timer
- จำนวนครั้ง
- Accuracy
- Score
- Combo

#### Rhythm Mode

ผู้เล่นทำท่าตามคำสั่งและจังหวะเพลง

ตัวอย่าง:

- ยกแขนซ้าย
- ยกแขนขวา
- ยกเข่าสลับ
- ก้าวซ้าย / ขวา
- ชกซ้าย / ขวา

---

## 5. รายการท่าออกกำลังกาย

| Class ID | Class Name | รายละเอียด | การนำไปใช้ในเกม |
|---|---|---|---|
| 0 | Standing / Idle | ยืนปกติ | สถานะเริ่มต้น |
| 1 | Arms Up | ยกแขนขึ้น | เก็บดาว / เปิดประตู |
| 2 | Jumping Jack | แยกขาและยกแขน | กระโดด / เพิ่มคะแนน |
| 3 | High Knees | ยกเข่าสลับซ้ายขวา | หลบสิ่งกีดขวาง |
| 4 | Side Step | ก้าวซ้ายหรือขวา | เคลื่อนที่ด้านข้าง |
| 5 | Air Punch | ชกอากาศ | โจมตีศัตรู |

ควรเริ่มจาก 3–4 ท่าก่อนใน MVP แล้วค่อยเพิ่มจำนวนท่า

---

## 6. Tech Stack

### 6.1 Frontend และ Game

| ส่วน | เทคโนโลยี | หน้าที่ |
|---|---|---|
| Programming Language | TypeScript | ภาษาหลักของเกมเว็บ |
| UI Framework | React | สร้างหน้าเว็บและ UI |
| Build Tool | Vite | สร้างและรันโปรเจกต์ |
| Game Engine | Phaser 3 | สร้างเกม 2D และระบบ Gameplay |
| Styling | CSS / Tailwind CSS | ออกแบบ UI |
| Camera API | WebRTC / getUserMedia | เปิดและรับภาพจาก Webcam |

### 6.2 AI และ Machine Learning

| ส่วน | เทคโนโลยี | หน้าที่ |
|---|---|---|
| Pose Estimation | MediaPipe Pose Landmarker | ตรวจจับจุดข้อต่อร่างกาย |
| ML Training | Python | เตรียมข้อมูลและ Train โมเดล |
| Deep Learning | TensorFlow / Keras | สร้าง Neural Network |
| Web Inference | TensorFlow.js | รันโมเดลบนเว็บ |
| Classical ML | scikit-learn | Train และทดสอบ SVM |
| Data Processing | NumPy / Pandas | จัดการ Dataset |

### 6.3 Backend และ Database

ใช้เฉพาะกรณีที่ต้องการเก็บข้อมูลผู้เล่น คะแนน หรือ Leaderboard

| ส่วน | เทคโนโลยี |
|---|---|
| Backend | Node.js + Express |
| Database ทางเลือกที่ 1 | Firebase |
| Database ทางเลือกที่ 2 | PostgreSQL |
| Deployment | Vercel / Netlify |
| Model Hosting | Static files / CDN / Server |

---

## 7. สถาปัตยกรรมระบบ

```text
Webcam
   |
   v
Camera Manager
   |
   v
MediaPipe Pose Landmarker
   |
   v
33 Body Landmarks
   |
   v
Feature Engineering
   |
   +----------------------+
   |                      |
   v                      v
SVM Classifier       Neural Network
   |                      |
   +----------+-----------+
              |
              v
Exercise Recognition
              |
              v
Rep Counter / Movement Validator
              |
              v
Game Controller
              |
              v
Phaser Game
              |
              v
Score / UI / Character / Mission
```

---

## 8. หน้าที่ของแต่ละระบบ

### 8.1 Camera Manager

หน้าที่:

- ขอสิทธิ์ใช้กล้อง
- เปิด Webcam
- ปิด Webcam
- ตรวจสอบว่ากล้องพร้อมใช้งานหรือไม่
- แสดงภาพกล้องใน UI
- ตรวจสอบว่าผู้เล่นอยู่ในกรอบหรือไม่

### 8.2 Pose Detector

หน้าที่:

- รับภาพจาก Webcam
- ตรวจจับจุดข้อต่อ
- ส่งค่า Landmark 33 จุด
- ตรวจสอบ Visibility / Confidence
- แจ้งเตือนเมื่อมองเห็นร่างกายไม่ครบ

### 8.3 Landmark Processor

หน้าที่:

- Normalize พิกัด
- คำนวณมุมข้อต่อ
- คำนวณระยะห่าง
- คำนวณทิศทางการเคลื่อนที่
- เตรียม Feature ให้โมเดล ML

### 8.4 Exercise Classifier

หน้าที่:

- รับ Feature จาก Landmark Processor
- จำแนกท่าออกกำลังกาย
- ส่ง Class และ Confidence
- กรองผลลัพธ์ที่ไม่น่าเชื่อถือ

### 8.5 Rep Counter

หน้าที่:

- ตรวจจับจุดเริ่มต้นของท่า
- ตรวจจับจุดสิ้นสุดของท่า
- นับจำนวนครั้ง
- ป้องกันการนับซ้ำ
- ตรวจสอบว่าท่าครบหรือไม่

### 8.6 Game Controller

หน้าที่:

- แปลงท่าออกกำลังกายเป็นคำสั่งเกม
- ควบคุมตัวละคร
- ตรวจสอบภารกิจ
- เพิ่มคะแนน
- จัดการ Combo
- จัดการ Game State

---

## 9. เทคนิค Machine Learning

## 9.1 Pose Estimation

ใช้ MediaPipe Pose Landmarker เพื่อแปลงภาพผู้เล่นเป็นจุดข้อต่อร่างกาย

จุดสำคัญ:

- Nose
- Left / Right Shoulder
- Left / Right Elbow
- Left / Right Wrist
- Left / Right Hip
- Left / Right Knee
- Left / Right Ankle

ผลลัพธ์ของแต่ละจุดประกอบด้วย:

```json
{
  "x": 0.42,
  "y": 0.35,
  "z": 0.01,
  "visibility": 0.98
}
```

หมายเหตุ:

- ค่า x และ y มักเป็นพิกัดแบบ Normalize
- ค่า z ใช้ประมาณตำแหน่งเชิงลึก
- visibility ใช้ตรวจสอบความมั่นใจว่ามองเห็นจุดนั้นหรือไม่

---

## 9.2 Feature Engineering

ไม่ควรใช้พิกัดดิบเพียงอย่างเดียว เพราะผู้เล่นแต่ละคนมีความสูงและระยะห่างจากกล้องต่างกัน

ควรสร้าง Feature เช่น:

- ตำแหน่งข้อต่อที่ Normalize แล้ว
- มุมข้อศอก
- มุมเข่า
- มุมไหล่
- ระยะห่างระหว่างมือ
- ระยะห่างระหว่างเท้า
- ตำแหน่งมือเทียบกับไหล่
- ตำแหน่งเข่าเทียบกับสะโพก
- ความเร็วการเคลื่อนที่
- ทิศทางการเคลื่อนที่
- Visibility ของจุดสำคัญ

ตัวอย่างการ Normalize:

```text
x' = (x - hipCenterX) / bodyScale
y' = (y - hipCenterY) / bodyScale
```

โดย:

- hipCenter คือจุดกึ่งกลางของสะโพก
- bodyScale คือค่าขนาดร่างกาย เช่น ระยะระหว่างไหล่หรือสะโพก

---

## 9.3 โมเดล SVM

SVM ใช้เป็นโมเดล Machine Learning สำหรับจำแนกท่าจาก Feature

### ข้อดี

- เหมาะกับ Dataset ขนาดเล็กถึงปานกลาง
- ทำงานได้ดีกับ Feature ที่ออกแบบมาแล้ว
- Train และอธิบายได้ง่าย
- ใช้เป็น Baseline สำหรับเปรียบเทียบกับ NN

### ข้อจำกัด

- ไม่เข้าใจลำดับการเคลื่อนไหวโดยตรง
- ต้องออกแบบ Feature ให้ดี
- หากมีหลายเฟรมควรสร้าง Sequence Feature หรือใช้วิธีอื่นร่วมด้วย

### การใช้ SVM

```text
Landmarks
   |
   v
Feature Engineering
   |
   v
SVM
   |
   v
Exercise Class
```

---

## 9.4 Neural Network

ใช้ Neural Network เป็นโมเดลหลักของโครงการ

### เหตุผล

- เรียนรู้ความสัมพันธ์ของ Feature ได้
- ขยายจำนวนท่าได้
- สามารถพัฒนาเป็นโมเดลแบบ Sequence ได้
- สามารถนำไปใช้บนเว็บด้วย TensorFlow.js
- เหมาะกับการพัฒนา AI ที่มี Dataset ของตัวเอง

### โครงสร้าง MLP เบื้องต้น

```text
Input Features
      |
      v
Dense(128, ReLU)
      |
      v
Dropout(0.2)
      |
      v
Dense(64, ReLU)
      |
      v
Dense(Number of Classes, Softmax)
```

ตัวอย่างโค้ด Keras:

```python
from tensorflow.keras import Sequential
from tensorflow.keras.layers import Dense, Dropout

model = Sequential([
    Dense(128, activation="relu", input_shape=(FEATURES,)),
    Dropout(0.2),
    Dense(64, activation="relu"),
    Dense(NUM_CLASSES, activation="softmax")
])
```

### โมเดล Sequence ในอนาคต

ถ้าต้องการจำแนกการเคลื่อนไหวหลายเฟรม เช่น

```text
ยืนปกติ
   -> เริ่มยกแขน
   -> แขนสูง
   -> เริ่มลดแขน
   -> กลับสู่ท่าเริ่มต้น
```

สามารถพัฒนาเป็น:

- GRU
- LSTM
- 1D CNN
- Transformer

แนะนำให้เริ่มจาก MLP ก่อน แล้วค่อยพัฒนาเป็น GRU/LSTM เมื่อมี Dataset มากขึ้น

---

## 10. แนวทางเลือกโมเดล

| เป้าหมาย | โมเดลที่เหมาะสม |
|---|---|
| Prototype เร็ว | Rule-based + MediaPipe |
| จำแนกท่าง่ายจาก Feature | SVM |
| โมเดลหลักของโครงการ | Neural Network / MLP |
| จำแนกการเคลื่อนไหวหลายเฟรม | GRU / LSTM |
| เปรียบเทียบผลการทดลอง | SVM vs NN |

### ข้อสรุป

ใช้โครงสร้างดังนี้:

```text
MediaPipe Pose
      +
Feature Engineering
      +
Neural Network เป็นโมเดลหลัก
      +
SVM เป็น Baseline
      +
Rule-based Rep Counter
```

---

## 11. Dataset

### 11.1 คลาสข้อมูล

ควรมีข้อมูลอย่างน้อย:

- Standing / Idle
- Arms Up
- Jumping Jack
- High Knees
- Side Step
- Air Punch

### 11.2 วิธีเก็บข้อมูล

1. เปิดกล้อง
2. ให้ผู้ทดลองทำท่าที่กำหนด
3. บันทึก Pose Landmarks แทนการเก็บภาพ หากไม่จำเป็นต้องใช้ภาพ
4. กำหนด Label ให้แต่ละเฟรมหรือแต่ละ Sequence
5. Normalize ข้อมูล
6. แบ่ง Train / Validation / Test

### 11.3 รูปแบบ Dataset

```text
dataset/
├── raw/
│   ├── standing/
│   ├── arms_up/
│   ├── jumping_jack/
│   ├── high_knees/
│   ├── side_step/
│   └── air_punch/
│
├── processed/
│   ├── train.csv
│   ├── validation.csv
│   └── test.csv
│
└── labels.json
```

### 11.4 การแบ่งข้อมูล

ตัวอย่าง:

- Training: 70%
- Validation: 15%
- Testing: 15%

ควรแบ่งตามผู้ทดลองด้วยถ้าเป็นไปได้ เพื่อทดสอบว่าโมเดลรองรับผู้เล่นคนใหม่ได้จริง ไม่ใช่จำเฉพาะคนที่ใช้เก็บข้อมูล

### 11.5 Data Augmentation

สามารถเพิ่มความหลากหลายของข้อมูลด้วย:

- เพิ่ม Noise เล็กน้อย
- ปรับ Scale
- ปรับตำแหน่ง
- ปรับความเร็วของ Sequence
- ใช้ข้อมูลจากผู้เล่นหลายคน
- ใช้มุมกล้องหลายแบบ

---

## 12. Rep Counter

ควรแยกระบบนับจำนวนครั้งออกจาก Exercise Classifier

### ตัวอย่าง High Knees

```text
READY
  |
  v
ตรวจเข่าซ้ายสูง
  |
  v
LEFT_UP
  |
  v
เข่าซ้ายลง
  |
  v
เพิ่มจำนวนครั้ง
  |
  v
READY
```

### หลักการสำคัญ

- ใช้ State Machine
- ใช้ Threshold
- ใช้ Smoothing
- ใช้ Cooldown
- ไม่เพิ่มคะแนนเมื่อ Confidence ต่ำ
- ไม่เพิ่มคะแนนเมื่อมองเห็นร่างกายไม่ครบ
- ตรวจสอบท่าเริ่มต้นและท่าสิ้นสุด

### ตัวอย่าง State

```text
ready
leftUp
rightUp
cooldown
invalid
```

---

## 13. ระบบคะแนน

ตัวอย่างการคำนวณ:

```text
คะแนนพื้นฐาน = จำนวนครั้ง x 10

โบนัสความถูกต้อง = +5
โบนัส Combo = +10
```

ควรพิจารณา:

- จำนวนครั้ง
- ความถูกต้องของท่า
- ความต่อเนื่อง
- การทำตามคำสั่ง
- เวลา
- ภารกิจที่สำเร็จ

ไม่ควรให้คะแนนจากรูปร่าง น้ำหนัก หรือความผอมของผู้เล่น

---

## 14. UI ที่ควรมี

### หน้า Main Menu

- Start Game
- Exercise List
- How to Play
- Settings
- Exit / Stop Camera

### หน้า Camera Calibration

- ภาพจากกล้อง
- กรอบแนะนำตำแหน่งยืน
- ตรวจสอบว่ามองเห็นร่างกายครบ
- ปุ่ม Start
- คำแนะนำเรื่องแสงและระยะห่าง

### หน้า Gameplay

- ภาพกล้องขนาดเล็ก
- ตัวละคร
- คำสั่งท่าปัจจุบัน
- Score
- Combo
- Rep Count
- Timer
- Progress Bar
- Feedback จาก AI
- Pause
- Stop Game

### หน้า Result

- คะแนนรวม
- จำนวนครั้ง
- Accuracy
- เวลาเล่น
- ท่าที่ทำได้
- คำแนะนำสำหรับรอบต่อไป
- ปุ่มเล่นใหม่
- ปุ่มกลับเมนู

---

## 15. โครงสร้างโฟลเดอร์

```text
fitness-ai-game/
│
├── src/
│   ├── main.ts
│   ├── App.tsx
│   │
│   ├── game/
│   │   ├── Game.ts
│   │   ├── scenes/
│   │   │   ├── BootScene.ts
│   │   │   ├── MenuScene.ts
│   │   │   ├── CalibrationScene.ts
│   │   │   ├── PlayScene.ts
│   │   │   └── ResultScene.ts
│   │   │
│   │   ├── entities/
│   │   │   ├── Player.ts
│   │   │   ├── Enemy.ts
│   │   │   └── Collectible.ts
│   │   │
│   │   └── systems/
│   │       ├── ScoreSystem.ts
│   │       ├── ComboSystem.ts
│   │       ├── MissionSystem.ts
│   │       └── ObstacleSystem.ts
│   │
│   ├── ai/
│   │   ├── CameraManager.ts
│   │   ├── PoseDetector.ts
│   │   ├── LandmarkProcessor.ts
│   │   ├── ExerciseClassifier.ts
│   │   ├── RepCounter.ts
│   │   ├── ConfidenceFilter.ts
│   │   └── types.ts
│   │
│   ├── ui/
│   │   ├── CameraView.tsx
│   │   ├── ExercisePanel.tsx
│   │   ├── ScoreBoard.tsx
│   │   ├── Timer.tsx
│   │   ├── FeedbackPanel.tsx
│   │   └── GameResult.tsx
│   │
│   ├── data/
│   │   ├── exercises.ts
│   │   ├── missions.ts
│   │   └── gameConfig.ts
│   │
│   └── utils/
│       ├── math.ts
│       ├── smoothing.ts
│       └── validation.ts
│
├── ml/
│   ├── dataset/
│   ├── notebooks/
│   ├── preprocess.py
│   ├── train_svm.py
│   ├── train_nn.py
│   ├── evaluate.py
│   ├── export_model.py
│   └── models/
│
├── public/
│   ├── assets/
│   │   ├── characters/
│   │   ├── backgrounds/
│   │   ├── ui/
│   │   ├── sounds/
│   │   └── models/
│   │
│   └── demo/
│
├── server/
│   ├── index.ts
│   ├── routes/
│   └── services/
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 16. Phase การพัฒนา

### Phase 1: Project Setup

เป้าหมาย:

- สร้างโปรเจกต์ React + Vite + TypeScript
- ติดตั้ง Phaser
- สร้างโครงสร้างโฟลเดอร์
- สร้าง Main Menu
- สร้างหน้า Gameplay เบื้องต้น

ผลลัพธ์:

- เว็บเปิดได้
- เปลี่ยนหน้าได้
- มีฉากเกมเบื้องต้น

### Phase 2: Camera System

เป้าหมาย:

- เปิด Webcam
- แสดงภาพกล้อง
- ขอ Permission
- ปิดกล้องได้
- ตรวจสอบ Camera Error

ผลลัพธ์:

- ผู้เล่นเห็นภาพตัวเอง
- ระบบกล้องทำงานบนเว็บ

### Phase 3: Pose Estimation

เป้าหมาย:

- ติดตั้ง MediaPipe
- ตรวจจับ Pose Landmarks
- แสดง Skeleton
- ตรวจสอบ Visibility
- ตรวจสอบว่าร่างกายอยู่ในกรอบ

ผลลัพธ์:

- ระบบตรวจจับข้อต่อแบบ Real-time

### Phase 4: Dataset Collection — Skipped

ไม่ใช้ browser-side Dataset Collector ใน implementation นี้ การฝึกโมเดล Phase 5 ใช้ชุดข้อมูล pose ที่เตรียมไว้/ชุดข้อมูล Physical Exercise Recognition ที่อยู่ในโปรเจกต์แทน

### Phase 5: ML Training

เป้าหมาย:

- Train SVM
- Train Neural Network
- เปรียบเทียบ Accuracy
- ทดสอบ Precision / Recall / F1-score
- ตรวจสอบ Confusion Matrix
- Export โมเดล

ผลลัพธ์:

- ได้โมเดลจำแนกท่า

### Phase 6: Web Inference

เป้าหมาย:

- นำโมเดลมาใช้บนเว็บ
- เชื่อม MediaPipe กับ Classifier
- แสดงชื่อท่า
- แสดง Confidence
- จัดการ Prediction Smoothing

ผลลัพธ์:

- เว็บสามารถจำแนกท่าได้แบบ Real-time

### Phase 7: Rep Counter

เป้าหมาย:

- สร้าง State Machine
- นับจำนวนครั้ง
- ป้องกันการนับซ้ำ
- ตรวจสอบท่าครบ
- เพิ่ม Feedback

ผลลัพธ์:

- ระบบนับจำนวนครั้งใช้งานได้

### Phase 8: Game Integration

เป้าหมาย:

- เชื่อม AI กับ Phaser
- ควบคุมตัวละคร
- สร้างสิ่งกีดขวาง
- สร้างเหรียญและดาว
- เพิ่ม Score
- เพิ่ม Combo
- เพิ่ม Timer

ผลลัพธ์:

- ได้เกมที่เล่นด้วยท่าทางจริง

### Phase 9: UI และ Result

เป้าหมาย:

- ทำหน้า Result
- แสดงคะแนน
- แสดงจำนวนครั้ง
- แสดง Accuracy
- เพิ่มปุ่ม Restart
- เพิ่มระบบตั้งค่า

ผลลัพธ์:

- เกมมี Flow ครบตั้งแต่เริ่มจนจบ

### Phase 10: Testing และ Deployment

เป้าหมาย:

- ทดสอบหลายอุปกรณ์
- ทดสอบหลายสภาพแสง
- ทดสอบผู้เล่นหลายคน
- ทดสอบประสิทธิภาพ
- ทดสอบ Permission กล้อง
- Deploy ขึ้น Vercel หรือ Netlify

ผลลัพธ์:

- เกมพร้อมให้ผู้ใช้ทดลองเล่น

---

## 17. การประเมินผล ML

ควรเก็บผลการทดลองของแต่ละโมเดล

### Metrics

- Accuracy
- Precision
- Recall
- F1-score
- Confusion Matrix
- Inference Time
- FPS
- Model Size
- CPU / GPU Usage

### ตารางเปรียบเทียบ

| Model | Accuracy | Precision | Recall | F1-score | Inference Time |
|---|---:|---:|---:|---:|---:|
| SVM | รอผลทดลอง | รอผลทดลอง | รอผลทดลอง | รอผลทดลอง | รอผลทดลอง |
| MLP | รอผลทดลอง | รอผลทดลอง | รอผลทดลอง | รอผลทดลอง | รอผลทดลอง |
| GRU / LSTM | รอผลทดลอง | รอผลทดลอง | รอผลทดลอง | รอผลทดลอง | รอผลทดลอง |

ห้ามกำหนดผลลัพธ์ล่วงหน้า ควรใช้ค่าจากการทดลองจริง

---

## 18. Performance และ Real-time

แนวทางเพิ่มประสิทธิภาพ:

1. ประมวลผล Pose ที่ประมาณ 15–30 FPS ตามความสามารถของอุปกรณ์
2. ลดขนาดภาพก่อนส่งเข้า Pose Model
3. ใช้ Smoothing เพื่อลด Jitter
4. ไม่ประมวลผลซ้ำถ้าเฟรมก่อนหน้ายังไม่เสร็จ
5. แยก AI Processing ออกจาก UI Rendering หากจำเป็น
6. ใช้ Web Worker ในอนาคตเมื่อระบบซับซ้อน
7. ใช้โมเดลขนาดเล็กสำหรับเว็บ
8. ลดจำนวน Feature ที่ไม่จำเป็น
9. ไม่ส่งภาพกล้องขึ้น Server หากไม่จำเป็น
10. แสดงสถานะเมื่อ FPS ต่ำหรือ Confidence ต่ำ

---

## 19. ความเป็นส่วนตัวและความปลอดภัย

ควรออกแบบให้:

- ขอ Permission กล้องอย่างชัดเจน
- แจ้งผู้เล่นว่ากล้องใช้เพื่ออะไร
- ปิดกล้องเมื่อออกจากเกม
- ประมวลผลบนเครื่องผู้เล่นเป็นหลัก
- ไม่บันทึกภาพหรือวิดีโอโดยไม่จำเป็น
- หากเก็บ Landmark ต้องแจ้งผู้ใช้
- ไม่ส่งข้อมูลส่วนตัวขึ้น Server โดยไม่จำเป็น
- มีปุ่มหยุดกล้องและหยุดเกม
- ไม่ให้คะแนนจากรูปร่าง น้ำหนัก หรือความผอม

---

## 20. ข้อควรระวังด้านการออกกำลังกาย

เกมควรมีคำแนะนำทั่วไป:

- เล่นในพื้นที่ปลอดภัย
- ตรวจสอบว่ามีพื้นที่ขยับเพียงพอ
- ใช้แสงที่เพียงพอ
- วอร์มอัพก่อนเล่น
- หยุดพักเมื่อเหนื่อยหรือไม่สบาย
- ไม่บังคับให้ผู้เล่นทำท่าที่เจ็บหรือไม่สะดวก
- มีระดับความยากหลายระดับ
- มีโหมด Low Impact ที่ไม่ต้องกระโดด
- ไม่ควรใช้คะแนนเป็นตัวตัดสินสุขภาพของผู้เล่น

---

## 21. MVP ที่แนะนำ

เวอร์ชันแรกควรมีเพียง:

1. หน้า Start
2. เปิด Webcam
3. MediaPipe Pose
4. จำแนก 3 ท่า:
   - Arms Up
   - High Knees
   - Side Step
5. ใช้ Neural Network เบื้องต้น
6. มี SVM เป็น Baseline
7. นับจำนวนครั้ง
8. มีตัวละคร 2D
9. มี Score
10. มี Timer
11. มี Result Screen

ยังไม่ควรเริ่มจากระบบใหญ่ เช่น Multiplayer, Leaderboard, ระบบสมาชิก หรือด่านจำนวนมาก จนกว่า AI และระบบกล้องจะทำงานได้เสถียร

---

## 22. Definition of Done สำหรับ MVP

### Camera

- [ ] เปิดกล้องได้
- [ ] ปิดกล้องได้
- [ ] แสดง Permission Error ได้
- [ ] ตรวจสอบร่างกายอยู่ในกรอบได้

### Pose Detection

- [ ] ตรวจจับ Landmark ได้
- [ ] แสดง Skeleton ได้
- [ ] ตรวจสอบ Visibility ได้
- [ ] รองรับการยืนหน้ากล้อง

### Machine Learning

- [ ] มี Dataset
- [ ] มีการ Normalize
- [ ] Train SVM แล้ว
- [ ] Train NN แล้ว
- [ ] เปรียบเทียบ Metrics แล้ว
- [ ] Export โมเดลได้
- [ ] ใช้งานโมเดลบนเว็บได้

### Game

- [ ] มีตัวละคร
- [ ] ควบคุมตัวละครด้วยท่าได้
- [ ] มี Score
- [ ] มี Rep Counter
- [ ] มี Timer
- [ ] มี Game Over / Result
- [ ] มี Restart

### Testing

- [ ] ทดสอบบน Chrome
- [ ] ทดสอบบน Edge
- [ ] ทดสอบ Webcam หลายรุ่น
- [ ] ทดสอบผู้เล่นหลายคน
- [ ] ทดสอบแสงสว่างหลายระดับ
- [ ] ทดสอบ FPS
- [ ] ทดสอบกรณีไม่อนุญาตกล้อง

---

## 23. สรุปเทคโนโลยีที่เลือก

```text
Frontend:
React + TypeScript + Vite

Game:
Phaser 3

Camera:
WebRTC / getUserMedia

Pose Estimation:
MediaPipe Pose Landmarker

Main ML Model:
Neural Network / MLP

Baseline Model:
SVM

Training:
Python + TensorFlow/Keras + scikit-learn

Web Inference:
TensorFlow.js หรือ TypeScript Inference

Backend:
Node.js + Express (ถ้าจำเป็น)

Database:
Firebase หรือ PostgreSQL (ถ้าจำเป็น)

Deployment:
Vercel หรือ Netlify
```

## ข้อสรุปสุดท้าย

แนวทางหลักของโครงการคือ:

> MediaPipe ใช้ตรวจจับร่างกาย → Feature Engineering → Neural Network ใช้จำแนกท่า → SVM ใช้เปรียบเทียบ → Rep Counter ตรวจจำนวนครั้ง → Phaser ใช้สร้างเกม

ควรพัฒนาแบบค่อยเป็นค่อยไป โดยเริ่มจาก Camera + Pose Detection ก่อน จากนั้นจึงสร้าง Dataset, Train ML และเชื่อมเข้ากับ Gameplay
