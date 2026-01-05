"""
Export Service
Handles data export (CSV, PDF) for payments, invoices, and reports
"""

import csv
import io
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT

from app.core.config import settings
from app.models.payment import PaymentTransaction
from app.models.credit import CreditTransaction
from app.models.user import User


class ExportService:
    """Service for exporting data"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    # ============================================================
    # Payment History Export
    # ============================================================
    
    async def export_payment_history_csv(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> bytes:
        """
        Export payment history as CSV
        
        Args:
            user_id: User ID
            start_date: Start date filter
            end_date: End date filter
        
        Returns:
            CSV file content as bytes
        """
        # Build query
        query = select(PaymentTransaction).where(PaymentTransaction.user_id == user_id)
        
        if start_date:
            query = query.where(PaymentTransaction.created_at >= start_date)
        if end_date:
            query = query.where(PaymentTransaction.created_at <= end_date)
        
        query = query.order_by(PaymentTransaction.created_at.desc())
        
        # Execute query
        result = await self.db.execute(query)
        payments = result.scalars().all()
        
        # Create CSV
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            'Date',
            'Transaction ID',
            'Amount (USD)',
            'Credits Added',
            'Status',
            'Payment Method',
            'Stripe Payment ID'
        ])
        
        # Data
        for payment in payments:
            writer.writerow([
                payment.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                payment.id,
                f'${payment.amount_usd:.2f}',
                payment.credits_added,
                payment.status,
                'Credit Card',  # TODO: Get actual payment method from Stripe
                payment.stripe_payment_intent_id or ''
            ])
        
        # Convert to bytes
        return output.getvalue().encode('utf-8')
    
    async def export_credit_history_csv(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> bytes:
        """
        Export credit transaction history as CSV
        
        Args:
            user_id: User ID
            start_date: Start date filter
            end_date: End date filter
        
        Returns:
            CSV file content as bytes
        """
        # Build query
        query = select(CreditTransaction).where(CreditTransaction.user_id == user_id)
        
        if start_date:
            query = query.where(CreditTransaction.created_at >= start_date)
        if end_date:
            query = query.where(CreditTransaction.created_at <= end_date)
        
        query = query.order_by(CreditTransaction.created_at.desc())
        
        # Execute query
        result = await self.db.execute(query)
        transactions = result.scalars().all()
        
        # Create CSV
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            'Date',
            'Transaction ID',
            'Type',
            'Amount (Credits)',
            'Balance Before',
            'Balance After',
            'Description'
        ])
        
        # Data
        for tx in transactions:
            writer.writerow([
                tx.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                tx.id,
                tx.type,
                tx.amount,
                tx.balance_before,
                tx.balance_after,
                tx.description or ''
            ])
        
        # Convert to bytes
        return output.getvalue().encode('utf-8')
    
    # ============================================================
    # Invoice Generation
    # ============================================================
    
    async def generate_invoice_pdf(
        self,
        payment_id: str,
        user_id: str
    ) -> bytes:
        """
        Generate invoice PDF for a payment
        
        Args:
            payment_id: Payment transaction ID
            user_id: User ID (for verification)
        
        Returns:
            PDF file content as bytes
        
        Raises:
            ValueError: If payment not found or doesn't belong to user
        """
        # Get payment
        result = await self.db.execute(
            select(PaymentTransaction).where(PaymentTransaction.id == payment_id)
        )
        payment = result.scalar_one_or_none()
        
        if not payment:
            raise ValueError("Payment not found")
        
        if payment.user_id != user_id:
            raise ValueError("Payment does not belong to user")
        
        # Get user
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            raise ValueError("User not found")
        
        # Create PDF
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        story = []
        
        # Styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=30,
            alignment=TA_CENTER
        )
        
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=14,
            textColor=colors.HexColor('#333333'),
            spaceAfter=12
        )
        
        # Title
        story.append(Paragraph("INVOICE", title_style))
        story.append(Spacer(1, 0.3*inch))
        
        # Company Info
        company_info = f"""
        <b>{settings.APP_NAME}</b><br/>
        Invoice #: INV-{payment.id[:8].upper()}<br/>
        Date: {payment.created_at.strftime('%B %d, %Y')}<br/>
        Status: {payment.status.upper()}
        """
        story.append(Paragraph(company_info, styles['Normal']))
        story.append(Spacer(1, 0.3*inch))
        
        # Bill To
        story.append(Paragraph("Bill To:", heading_style))
        bill_to = f"""
        {user.full_name}<br/>
        {user.email}
        """
        story.append(Paragraph(bill_to, styles['Normal']))
        story.append(Spacer(1, 0.3*inch))
        
        # Invoice Details Table
        story.append(Paragraph("Invoice Details:", heading_style))
        
        table_data = [
            ['Description', 'Quantity', 'Unit Price', 'Amount'],
            ['Credit Top-up', f'{payment.credits_added} credits', f'${payment.amount_usd:.2f}', f'${payment.amount_usd:.2f}']
        ]
        
        table = Table(table_data, colWidths=[3*inch, 1.5*inch, 1.5*inch, 1.5*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        
        story.append(table)
        story.append(Spacer(1, 0.3*inch))
        
        # Total
        total_style = ParagraphStyle(
            'Total',
            parent=styles['Normal'],
            fontSize=14,
            alignment=TA_RIGHT,
            spaceAfter=12
        )
        story.append(Paragraph(f"<b>Total: ${payment.amount_usd:.2f} USD</b>", total_style))
        story.append(Spacer(1, 0.3*inch))
        
        # Payment Info
        if payment.stripe_payment_intent_id:
            payment_info = f"""
            <b>Payment Information:</b><br/>
            Payment Method: Credit Card<br/>
            Transaction ID: {payment.stripe_payment_intent_id}<br/>
            Payment Date: {payment.created_at.strftime('%B %d, %Y %H:%M:%S UTC')}
            """
            story.append(Paragraph(payment_info, styles['Normal']))
        
        story.append(Spacer(1, 0.5*inch))
        
        # Footer
        footer = f"""
        <i>Thank you for your business!</i><br/>
        <br/>
        Questions? Contact us at support@{settings.APP_NAME.lower().replace(' ', '')}.com
        """
        story.append(Paragraph(footer, styles['Normal']))
        
        # Build PDF
        doc.build(story)
        
        # Get PDF bytes
        pdf_bytes = buffer.getvalue()
        buffer.close()
        
        return pdf_bytes
    
    # ============================================================
    # Combined Export
    # ============================================================
    
    async def export_full_transaction_history_csv(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> bytes:
        """
        Export combined payment and credit history as CSV
        
        Args:
            user_id: User ID
            start_date: Start date filter
            end_date: End date filter
        
        Returns:
            CSV file content as bytes
        """
        # Get payments
        payment_query = select(PaymentTransaction).where(PaymentTransaction.user_id == user_id)
        if start_date:
            payment_query = payment_query.where(PaymentTransaction.created_at >= start_date)
        if end_date:
            payment_query = payment_query.where(PaymentTransaction.created_at <= end_date)
        
        payment_result = await self.db.execute(payment_query)
        payments = payment_result.scalars().all()
        
        # Get credit transactions
        credit_query = select(CreditTransaction).where(CreditTransaction.user_id == user_id)
        if start_date:
            credit_query = credit_query.where(CreditTransaction.created_at >= start_date)
        if end_date:
            credit_query = credit_query.where(CreditTransaction.created_at <= end_date)
        
        credit_result = await self.db.execute(credit_query)
        credits = credit_result.scalars().all()
        
        # Combine and sort
        transactions = []
        
        for payment in payments:
            transactions.append({
                'date': payment.created_at,
                'type': 'Payment',
                'description': f'Credit top-up - {payment.credits_added} credits',
                'amount_usd': payment.amount_usd,
                'credits': payment.credits_added,
                'status': payment.status
            })
        
        for credit in credits:
            transactions.append({
                'date': credit.created_at,
                'type': 'Credit Transaction',
                'description': credit.description or credit.type,
                'amount_usd': None,
                'credits': credit.amount,
                'status': 'completed'
            })
        
        # Sort by date
        transactions.sort(key=lambda x: x['date'], reverse=True)
        
        # Create CSV
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            'Date',
            'Type',
            'Description',
            'Amount (USD)',
            'Credits',
            'Status'
        ])
        
        # Data
        for tx in transactions:
            writer.writerow([
                tx['date'].strftime('%Y-%m-%d %H:%M:%S'),
                tx['type'],
                tx['description'],
                f"${tx['amount_usd']:.2f}" if tx['amount_usd'] else '',
                tx['credits'],
                tx['status']
            ])
        
        # Convert to bytes
        return output.getvalue().encode('utf-8')
