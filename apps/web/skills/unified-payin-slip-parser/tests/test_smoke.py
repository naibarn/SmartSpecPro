from unified_slip_parser.router import parse_slip

def test_ktb_parse():
    payload = {
        "source": {
            "short_caption": "Krungthai กรุงไทย จ่ายบิลสำเร็จ รหัสอ้างอิง C20250505512519614446 จำนวนเงิน 421.00 บาท ค่าธรรมเนียม 0.00 บาท วันที่ทำรายการ 05 พ.ค. 2568 - 19:29"
        },
        "parse_options": {"mode": "auto"}
    }
    out = parse_slip(payload)
    assert out["detected_issuer"]["issuer_code"] == "KTB"
    assert out["transaction"]["amount"] == 421.0

def test_truemoney_parse():
    payload = {
        "source": {
            "short_caption": "TrueMoney Wallet ชำระเงินสำเร็จ จำนวนเงิน 89.00 บาท วันที่ทำรายการ 26 ก.พ. 2567 - 19:14"
        },
        "parse_options": {"mode": "auto"}
    }
    out = parse_slip(payload)
    assert out["detected_issuer"]["issuer_code"] == "TRUEMONEY"