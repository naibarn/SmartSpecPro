"""
Credit System Constants and Utilities

Business Model:
- 1 USD = 1,000 credits
- Markup: 15% (SmartSpec's revenue)
- Top-up: User pays $100 → Gets 85,000 credits ($85 worth)
- Usage: LLM costs $0.10 → Deduct 100 credits (no additional markup)
"""

from decimal import Decimal, ROUND_HALF_UP

# Credit conversion rate
USD_TO_CREDITS = 1000  # 1 USD = 1,000 credits
CREDITS_TO_USD = Decimal("0.001")  # 1 credit = $0.001

# Markup percentage (SmartSpec's revenue)
DEFAULT_MARKUP_PERCENT = Decimal("15.0")  # 15%


def usd_to_credits(usd_amount: Decimal) -> int:
    """
    Convert USD amount to credits.
    
    Args:
        usd_amount: Amount in USD (e.g., Decimal("0.10"))
    
    Returns:
        Credits as integer (e.g., 100 credits)
    
    Example:
        >>> usd_to_credits(Decimal("0.10"))
        100
        >>> usd_to_credits(Decimal("1.50"))
        1500
    """
    # R9.2: Use proper rounding to avoid floating point issues
    return int((usd_amount * USD_TO_CREDITS).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def credits_to_usd(credits: int) -> Decimal:
    """
    Convert credits to USD amount.
    
    Args:
        credits: Amount in credits (e.g., 100)
    
    Returns:
        USD amount as Decimal (e.g., Decimal("0.10"))
    
    Example:
        >>> credits_to_usd(100)
        Decimal('0.10')
        >>> credits_to_usd(1500)
        Decimal('1.50')
    """
    return Decimal(credits) * CREDITS_TO_USD


def calculate_credits_from_payment(
    payment_usd: Decimal, 
    markup_percent: Decimal = DEFAULT_MARKUP_PERCENT
) -> int:
    """
    Calculate credits to give user after payment (with markup deducted).
    
    Business logic:
    - User pays $100 (including markup)
    - Markup is 15% → $15 goes to SmartSpec
    - User gets credits worth $85 → 85,000 credits
    
    Formula:
        actual_value = payment / (1 + markup/100)
        credits = actual_value * 1000
    
    Args:
        payment_usd: Amount user paid in USD
        markup_percent: Markup percentage (default 15%)
    
    Returns:
        Credits to add to user's account
    
    Example:
        >>> calculate_credits_from_payment(Decimal("100"), Decimal("15"))
        85000
        >>> calculate_credits_from_payment(Decimal("10"), Decimal("15"))
        8500
    """
    # Calculate actual value after removing markup
    # R9.2: Ensure precision and proper rounding in financial calculations
    actual_value_usd = (payment_usd / (Decimal('1') + markup_percent / Decimal('100'))).quantize(Decimal('0.000001'))
    
    # Convert to credits
    return usd_to_credits(actual_value_usd)


def calculate_payment_from_credits(
    credits: int,
    markup_percent: Decimal = DEFAULT_MARKUP_PERCENT
) -> Decimal:
    """
    Calculate how much user needs to pay to get specific credits.
    
    Formula:
        usd_value = credits / 1000
        payment = usd_value * (1 + markup/100)
    
    Args:
        credits: Desired credits
        markup_percent: Markup percentage (default 15%)
    
    Returns:
        Payment amount in USD
    
    Example:
        >>> calculate_payment_from_credits(85000, Decimal("15"))
        Decimal('100.00')
        >>> calculate_payment_from_credits(8500, Decimal("15"))
        Decimal('10.00')
    """
    usd_value = credits_to_usd(credits)
    payment = usd_value * (1 + markup_percent / 100)
    return payment.quantize(Decimal("0.01"))  # Round to 2 decimal places
