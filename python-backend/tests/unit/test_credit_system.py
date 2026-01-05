"""
Unit Tests for Credit System
"""

import pytest
from decimal import Decimal
from app.core.credits import (
    usd_to_credits,
    credits_to_usd,
    calculate_credits_from_payment,
    calculate_payment_from_credits,
    USD_TO_CREDITS,
    DEFAULT_MARKUP_PERCENT
)


class TestCreditConversion:
    """Test credit conversion functions"""
    
    def test_usd_to_credits_basic(self):
        """Test basic USD to credits conversion"""
        assert usd_to_credits(Decimal("1.00")) == 1000
        assert usd_to_credits(Decimal("0.10")) == 100
        assert usd_to_credits(Decimal("0.01")) == 10
        assert usd_to_credits(Decimal("0.001")) == 1
    
    def test_usd_to_credits_large_amounts(self):
        """Test large amounts"""
        assert usd_to_credits(Decimal("100.00")) == 100000
        assert usd_to_credits(Decimal("1000.00")) == 1000000
    
    def test_credits_to_usd_basic(self):
        """Test basic credits to USD conversion"""
        assert credits_to_usd(1000) == Decimal("1.00")
        assert credits_to_usd(100) == Decimal("0.10")
        assert credits_to_usd(10) == Decimal("0.01")
        assert credits_to_usd(1) == Decimal("0.001")
    
    def test_credits_to_usd_large_amounts(self):
        """Test large amounts"""
        assert credits_to_usd(100000) == Decimal("100.00")
        assert credits_to_usd(1000000) == Decimal("1000.00")
    
    def test_conversion_roundtrip(self):
        """Test that conversion is reversible"""
        usd_amounts = [Decimal("0.01"), Decimal("1.00"), Decimal("10.00"), Decimal("100.00")]
        
        for usd in usd_amounts:
            credits = usd_to_credits(usd)
            usd_back = credits_to_usd(credits)
            assert usd_back == usd


class TestMarkupCalculation:
    """Test markup calculation functions"""
    
    def test_calculate_credits_from_payment_default_markup(self):
        """Test credits calculation with default 15% markup"""
        # User pays $100, gets ~86,957 credits ($86.957 value)
        credits = calculate_credits_from_payment(Decimal("100.00"))
        # $100 / 1.15 = $86.956521... * 1000 = 86,956.52 → rounded to 86,957
        assert credits in [86956, 86957]  # Allow for rounding differences
        
        # Verify actual value
        actual_value = credits_to_usd(credits)
        assert actual_value in [Decimal("86.956"), Decimal("86.957")]
    
    def test_calculate_credits_from_payment_custom_markup(self):
        """Test credits calculation with custom markup"""
        # 10% markup
        credits = calculate_credits_from_payment(Decimal("100.00"), Decimal("10"))
        expected = int(Decimal("100.00") / Decimal("1.10") * 1000)
        assert credits == expected
        
        # 20% markup
        credits = calculate_credits_from_payment(Decimal("100.00"), Decimal("20"))
        expected = int(Decimal("100.00") / Decimal("1.20") * 1000)
        assert credits == expected
    
    def test_calculate_credits_from_payment_small_amounts(self):
        """Test small payment amounts"""
        # $10 payment with 15% markup
        credits = calculate_credits_from_payment(Decimal("10.00"))
        # $10 / 1.15 * 1000 = 8,695.65... → rounded to 8,696
        assert credits in [8695, 8696]  # Allow for rounding differences
        
        # $1 payment with 15% markup
        credits = calculate_credits_from_payment(Decimal("1.00"))
        # $1 / 1.15 * 1000 = 869.56... → rounded to 870
        assert credits in [869, 870]  # Allow for rounding differences
    
    def test_calculate_payment_from_credits_default_markup(self):
        """Test payment calculation from credits with default markup"""
        # User wants 85,000 credits, needs to pay $97.75
        payment = calculate_payment_from_credits(85000)
        # 85,000 credits = $85.00
        # $85.00 * 1.15 = $97.75
        assert payment == Decimal("97.75")
        
        # To get exactly 86,956 credits (from $100 payment)
        payment_for_86956 = calculate_payment_from_credits(86956, Decimal("15"))
        assert payment_for_86956 == Decimal("100.00")  # $86.956 * 1.15 = $100.00
    
    def test_calculate_payment_from_credits_custom_markup(self):
        """Test payment calculation with custom markup"""
        # 10% markup
        payment = calculate_payment_from_credits(90000, Decimal("10"))
        assert payment == Decimal("99.00")  # $90 * 1.10 = $99
        
        # 20% markup
        payment = calculate_payment_from_credits(83000, Decimal("20"))
        expected = (Decimal("83.00") * Decimal("1.20")).quantize(Decimal("0.01"))
        assert payment == expected
    
    def test_markup_revenue_calculation(self):
        """Test that markup correctly represents SmartSpec's revenue"""
        payment = Decimal("100.00")
        markup_percent = Decimal("15")
        
        # Calculate credits
        credits = calculate_credits_from_payment(payment, markup_percent)
        actual_value = credits_to_usd(credits)
        
        # Calculate revenue
        revenue = payment - actual_value
        revenue_percent = (revenue / payment) * 100
        
        # Revenue should be approximately 15% of payment
        # Actually: $100 / 1.15 = $86.96, so revenue = $13.04 (13.04%)
        # This is because markup is on the base, not on the total
        assert revenue_percent < markup_percent  # Revenue % < Markup %
        assert revenue_percent > Decimal("13")  # Should be around 13%


class TestBusinessLogic:
    """Test business logic scenarios"""
    
    def test_topup_scenario_100_dollars(self):
        """Test: User pays $100, gets ~86,957 credits"""
        payment = Decimal("100.00")
        markup = Decimal("15")
        
        credits = calculate_credits_from_payment(payment, markup)
        actual_value = credits_to_usd(credits)
        markup_amount = payment - actual_value
        
        # User should get ~86,957 credits (with rounding)
        assert credits in [86956, 86957]  # Allow for rounding differences
        
        # Actual value should be ~$86.957
        assert actual_value in [Decimal("86.956"), Decimal("86.957")]
        
        # Markup amount should be ~$13.043 (13.04%)
        assert markup_amount in [Decimal("13.043"), Decimal("13.044")]
    
    def test_llm_usage_scenario(self):
        """Test: LLM costs $0.10, deduct 100 credits (no markup)"""
        llm_cost = Decimal("0.10")
        credits_to_deduct = usd_to_credits(llm_cost)
        
        assert credits_to_deduct == 100
        
        # Verify no markup on usage
        usd_back = credits_to_usd(credits_to_deduct)
        assert usd_back == llm_cost
    
    def test_full_user_journey(self):
        """Test complete user journey: topup → use → check balance"""
        # Step 1: User pays $100
        payment = Decimal("100.00")
        credits = calculate_credits_from_payment(payment)
        balance = credits
        
        # Step 2: User makes LLM call costing $0.50
        llm_cost = Decimal("0.50")
        credits_deducted = usd_to_credits(llm_cost)
        balance -= credits_deducted
        
        # Step 3: Check remaining balance
        remaining_usd = credits_to_usd(balance)
        
        # User should have ~$86.457 worth of credits left
        # (Started with ~$86.957, spent $0.50)
        assert remaining_usd in [Decimal("86.456"), Decimal("86.457")]
    
    def test_multiple_llm_calls(self):
        """Test multiple LLM calls until balance runs out"""
        # User pays $10
        payment = Decimal("10.00")
        balance = calculate_credits_from_payment(payment)
        
        # Each LLM call costs $0.10
        llm_cost = Decimal("0.10")
        credits_per_call = usd_to_credits(llm_cost)
        
        # Count how many calls can be made
        calls_made = 0
        while balance >= credits_per_call:
            balance -= credits_per_call
            calls_made += 1
        
        # User should be able to make around 85 calls
        # ($10 / 1.15 = $8.70, $8.70 / $0.10 = 87 calls)
        assert 80 <= calls_made <= 90


class TestEdgeCases:
    """Test edge cases"""
    
    def test_zero_payment(self):
        """Test zero payment"""
        credits = calculate_credits_from_payment(Decimal("0.00"))
        assert credits == 0
    
    def test_very_small_payment(self):
        """Test very small payment"""
        credits = calculate_credits_from_payment(Decimal("0.01"))
        assert credits >= 0
    
    def test_very_large_payment(self):
        """Test very large payment"""
        credits = calculate_credits_from_payment(Decimal("10000.00"))
        assert credits > 0
        
        # Should be able to convert back
        usd = credits_to_usd(credits)
        assert usd > Decimal("8000")  # After 15% markup
    
    def test_zero_credits(self):
        """Test zero credits"""
        usd = credits_to_usd(0)
        assert usd == Decimal("0.00")
    
    def test_one_credit(self):
        """Test single credit"""
        usd = credits_to_usd(1)
        assert usd == Decimal("0.001")


class TestMarkupTransparency:
    """Test that markup calculation is transparent and correct"""
    
    def test_markup_breakdown(self):
        """Test detailed breakdown of markup"""
        payment = Decimal("100.00")
        markup_percent = Decimal("15")
        
        # Calculate credits
        credits = calculate_credits_from_payment(payment, markup_percent)
        actual_value = credits_to_usd(credits)
        markup_amount = payment - actual_value
        
        # Print breakdown (for debugging)
        print(f"\nMarkup Breakdown:")
        print(f"  Payment: ${payment}")
        print(f"  Markup: {markup_percent}%")
        print(f"  Credits: {credits:,}")
        print(f"  Actual Value: ${actual_value}")
        print(f"  Markup Amount: ${markup_amount}")
        print(f"  Effective Revenue: {(markup_amount / payment * 100):.2f}%")
        
        # Verify calculations
        assert payment == actual_value + markup_amount
        assert credits == usd_to_credits(actual_value)
