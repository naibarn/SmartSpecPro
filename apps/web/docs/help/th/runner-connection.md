---
slug: runner-connection
title: คู่มือติดตั้งและเชื่อมต่อ SmartAIHub Runner
description: ติดตั้ง Runner บน Windows, macOS, Linux และ WSL2 พร้อมขั้นตอนอนุญาตและแก้ปัญหา
icon: Terminal
section: features
order: 67
pages: ["/dashboard", "/runners/connect"]
tags:
  - "runner"
  - "smartaihub runner"
  - "ติดตั้ง runner"
  - "เชื่อมต่อ runner"
  - "windows"
  - "macos"
  - "linux"
  - "wsl2"
  - "help"
  - "help/th"
aliases:
  - "runner-connection"
  - "Runner installation guide"
  - "วิธีติดตั้ง Runner"
---

# คู่มือติดตั้งและเชื่อมต่อ SmartAIHub Runner

SmartAIHub Runner เป็นโปรแกรมที่ทำงานบนเครื่องของคุณเพื่อให้ SmartAIHub ติดต่อกับเครื่องมือและความสามารถในเครื่องนั้นได้ การติดตั้ง Runner **ไม่ได้ติดตั้ง Codex, Claude, Hermes หรือ Antigravity ให้โดยอัตโนมัติ** ควรติดตั้งและลงชื่อเข้าใช้ Harness ที่ต้องการบนเครื่องก่อน จากนั้น Runner จะตรวจพบเครื่องมือที่รองรับและรายงานสถานะกลับ Dashboard

## เลือกแพ็กเกจ

1. เปิด Dashboard แล้วไปที่ **ดาวน์โหลดและอัปเดต Runner**
2. ดาวน์โหลดแพ็กเกจ CLI ให้ตรงกับระบบปฏิบัติการและสถาปัตยกรรมของเครื่อง
3. ไฟล์ Runner Desktop สำหรับ Windows/macOS ที่มีป้าย **ไฟล์ทดสอบ** เป็นรุ่น unsigned สำหรับทดสอบ ไม่ใช่แพ็กเกจ CLI ปกติ
4. เปิด Terminal หรือ PowerShell ในโฟลเดอร์ที่แตกไฟล์แพ็กเกจแล้ว

## Windows

1. ดาวน์โหลด CLI package สำหรับ Windows x64 แล้วแตกไฟล์ ZIP ไว้ในโฟลเดอร์ที่บัญชีผู้ใช้เขียนได้
2. เปิด PowerShell ในโฟลเดอร์ที่มี `smartaihub-runner.exe`
3. เริ่มเชื่อมต่อ:

```powershell
.\smartaihub-runner.exe connect
```

4. เปิด URL ที่ Runner แสดงในเบราว์เซอร์ ลงชื่อเข้าใช้บัญชี SmartAIHub ที่ต้องการใช้ แล้วตรวจชื่ออุปกรณ์ก่อนกด **Allow this Runner**
5. เมื่อ Terminal แสดงว่าเชื่อมต่อแล้ว ตรวจสอบและเริ่ม Runner:

```powershell
.\smartaihub-runner.exe status
.\smartaihub-runner.exe run
```

ให้เปิดหน้าต่าง Terminal ค้างไว้ระหว่างใช้งาน หากปิดหน้าต่าง Runner จะหยุดทำงาน

## macOS

1. ดาวน์โหลด CLI package ให้ตรงกับชิป: **macOS arm64** สำหรับ Apple Silicon หรือ **macOS x64** สำหรับ Intel
2. เปิด Terminal ในโฟลเดอร์ดาวน์โหลด แล้วแตกไฟล์โดยแทน `<ชื่อไฟล์แพ็กเกจ>` ด้วยชื่อไฟล์จริง:

```bash
tar -xzf <ชื่อไฟล์แพ็กเกจ>.tar.gz
chmod +x smartaihub-runner-macos-<สถาปัตยกรรม>-<เวอร์ชัน>
./smartaihub-runner-macos-<สถาปัตยกรรม>-<เวอร์ชัน> connect
```

3. เปิด URL ในเบราว์เซอร์ ลงชื่อเข้าใช้บัญชีที่ต้องการ แล้วตรวจชื่ออุปกรณ์ก่อนกด **Allow this Runner**
4. ตรวจสถานะและเริ่ม Runner โดยใช้ชื่อไฟล์เดียวกับที่แตกออกมา:

```bash
./smartaihub-runner-macos-<สถาปัตยกรรม>-<เวอร์ชัน> status
./smartaihub-runner-macos-<สถาปัตยกรรม>-<เวอร์ชัน> run
```

ให้เปิด Terminal ค้างไว้ขณะใช้งาน หาก macOS เตือนเรื่องแอปที่ดาวน์โหลดจากอินเทอร์เน็ต ให้ตรวจสอบแหล่งดาวน์โหลดและลายเซ็นตามนโยบายขององค์กรก่อนอนุญาต

## Linux x86_64 และ Debian

แพ็กเกจ Linux มี installer สำหรับลง binary และ systemd user service ในบัญชีปัจจุบัน ไม่ต้องใช้ `sudo`:

```bash
tar -xzf smartaihub-runner-linux-x86_64-<เวอร์ชัน>.tar.gz
cd smartaihub-runner-linux-x86_64-<เวอร์ชัน>
./install-linux-runner.sh install
~/.local/bin/smartaihub-runner connect
```

เปิด URL ในเบราว์เซอร์ ลงชื่อเข้าใช้บัญชีที่ต้องการ ตรวจชื่ออุปกรณ์ แล้วกด **Allow this Runner** จากนั้นเปิด service:

```bash
systemctl --user enable --now smartaihub-runner.service
systemctl --user status smartaihub-runner.service --no-pager
```

ดูบันทึกล่าสุดได้ด้วย:

```bash
journalctl --user -u smartaihub-runner.service -n 50 --no-pager
```

installer จะทำงานในบัญชีผู้ใช้ปัจจุบัน เก็บข้อมูล Runner ไว้ใน home directory และไม่เปิด systemd lingering ให้อัตโนมัติ

ถ้าเครื่องยังไม่มี systemd หรือ `systemctl --user` ใช้ไม่ได้ ให้ติดตั้ง binary ในบัญชีผู้ใช้แล้วเปิด Runner ค้างไว้ใน Terminal แทน:

```bash
install -Dm755 smartaihub-runner "$HOME/.local/bin/smartaihub-runner"
~/.local/bin/smartaihub-runner connect
~/.local/bin/smartaihub-runner run
```

## WSL2 บน Windows

WSL2 ใช้แพ็กเกจ Linux และเป็น Runner แยกจาก Windows Runner:

1. เปิด Terminal ภายใน WSL2 และติดตั้งแพ็กเกจ Linux x86_64 ตามหัวข้อ Linux ด้านบน อย่าเรียกไฟล์ `.exe` ของ Windows จาก WSL2
2. รัน `~/.local/bin/smartaihub-runner connect` แล้วเปิด URL อนุมัติในเบราว์เซอร์ Windows
3. กลับมาที่ Terminal ของ WSL2 รอให้คำสั่งเชื่อมต่อจบ แล้วเปิด service ตามขั้นตอน Linux

ถ้า Runner แจ้ง `RUNNER_BROWSER_OPEN_FAILED` ให้คัดลอก URL เต็มที่แสดงใน Terminal แล้ววางในเบราว์เซอร์ Windows ด้วยตนเอง อย่าใช้ URL เก่าหรือรหัสที่หมดอายุ

หากติดตั้ง Runner อีกตัวบนเครื่องหรือบัญชีอื่น ให้ใช้ `SAH_RUNNER_ID`, `SAH_RUNNER_DEVICE_ID` และ `SAH_RUNNER_DATA_ROOT` ที่ไม่ซ้ำกัน เพื่อไม่ให้ข้อมูลประจำตัวหรือข้อมูล Runner ชนกัน

## การอนุญาตและบัญชี

- กด **Allow this Runner** เฉพาะเมื่อชื่อ Runner และอุปกรณ์ตรงกับเครื่องที่กำลังตั้งค่า
- Runner ที่อนุมัติแล้วเป็นของบัญชีที่ล็อกอินอยู่ หากเห็น `Runner is owned by another user` ให้สลับไปใช้บัญชีเจ้าของ Runner หรือสร้าง Runner ID ใหม่สำหรับเครื่อง/บัญชีแยก
- การกด Allow สำเร็จยืนยันการจับคู่ แต่ Runner ต้องยังทำงานอยู่ (เปิด `run` หรือ service) จึงจะแสดง Online
- การอัปเดต binary โดยทั่วไปไม่ต้องจับคู่ใหม่ หากข้อมูล enrollment ใน data root เดิมยังอยู่

## แก้ปัญหาเบื้องต้น

| อาการ | วิธีตรวจสอบ |
|---|---|
| `RUNNER_BROWSER_OPEN_FAILED` | คัดลอก URL ล่าสุดจาก Terminal แล้วเปิดด้วยตนเอง |
| `RUNNER_REQUEST_INVALID` หรือรหัสหมดอายุ | เริ่ม `connect` ใหม่และใช้ URL/รหัสล่าสุด ตรวจว่าเปิด URL จาก Runner ตัวที่กำลังเชื่อมต่อ |
| `Runner is owned by another user` | ลงชื่อเข้าใช้บัญชีเจ้าของเดิม หรือกำหนด Runner ID, device ID และ data root ชุดใหม่ |
| Dashboard แสดง Offline หลัง Allow | ตรวจว่า `run` หรือ systemd service ยังทำงาน และดู log ของ Runner |
| Linux แจ้งไม่มี `systemctl` | ใช้คำสั่งติดตั้ง binary แบบไม่ใช้ service ตามหัวข้อ Linux แล้วเปิด `run` ค้างไว้ใน Terminal |

อย่าโพสต์ access token, private key, credential bundle หรือ URL ที่มีรหัสเชื่อมต่อที่ยังไม่หมดอายุลงใน ticket หรือช่องสาธารณะ

## อัปเดตและถอนการติดตั้งบน Linux

ดาวน์โหลดแพ็กเกจ Linux รุ่นใหม่ แล้วรันจากโฟลเดอร์แพ็กเกจ:

```bash
./install-linux-runner.sh upgrade
```

ถอนเฉพาะ binary และ service ที่ติดตั้งไว้ โดย installer จะเก็บ enrollment และข้อมูล workspace ไว้:

```bash
./install-linux-runner.sh uninstall
```
