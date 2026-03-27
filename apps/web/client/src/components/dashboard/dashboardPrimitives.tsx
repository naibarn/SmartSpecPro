import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const dashboardSurfaceClass =
  'rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl';

export const dashboardInsetSurfaceClass =
  'rounded-2xl border border-slate-200 bg-white/95 shadow-sm';

export const dashboardSectionEyebrowClass =
  'text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500';

export const dashboardMetaLineClass =
  'flex items-center gap-2 mt-1 text-xs leading-5 text-slate-500';

export const dashboardMetaPillClass =
  'rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700';

export const dashboardCardBodyClass =
  'text-sm leading-6 text-slate-500';

export const dashboardCardDescriptionClass =
  'text-sm leading-6 text-slate-500';

export const dashboardCardTitleClass =
  'text-sm font-semibold text-slate-900';

export const dashboardCardTitleLgClass =
  'text-lg font-semibold text-slate-900';

export const dashboardCardTitleXlClass =
  'text-xl font-semibold text-slate-900';

type DashboardIconComponent = ElementType<{ className?: string }>;

type DashboardSectionHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  trailing?: ReactNode;
  titleClassName?: string;
  descriptionClassName?: string;
};

export function DashboardSectionHeader({
  eyebrow,
  title,
  description,
  trailing,
  titleClassName = dashboardCardTitleLgClass,
  descriptionClassName = dashboardCardDescriptionClass,
}: DashboardSectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className={dashboardSectionEyebrowClass}>{eyebrow}</p>
        <h2 className={cn('mt-1', titleClassName)}>{title}</h2>
        <p className={cn('mt-1', descriptionClassName)}>{description}</p>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

type DashboardSurfaceProps<T extends ElementType = 'div'> = {
  as?: T;
  className?: string;
  children: ReactNode;
};

export function DashboardSurface<T extends ElementType = 'div'>({
  as,
  className,
  children,
}: DashboardSurfaceProps<T>) {
  const Component = as ?? 'div';
  return <Component className={cn(dashboardSurfaceClass, className)}>{children}</Component>;
}

type DashboardCardProps<T extends ElementType = 'div'> = {
  as?: T;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  titleClassName?: string;
  descriptionClassName?: string;
};

export function DashboardCard<T extends ElementType = 'div'>({
  as,
  className,
  headerClassName,
  bodyClassName,
  footerClassName,
  eyebrow,
  title,
  description,
  leading,
  trailing,
  children,
  footer,
  titleClassName = dashboardCardTitleLgClass,
  descriptionClassName = dashboardCardDescriptionClass,
}: DashboardCardProps<T>) {
  const Component = as ?? 'div';
  const hasHeader = Boolean(eyebrow || title || description || leading || trailing);

  return (
    <DashboardSurface as={Component} className={cn('overflow-hidden', className)}>
      {hasHeader ? (
        <div className={cn('flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6', headerClassName)}>
          <div className="min-w-0 flex-1">
            {eyebrow ? <p className={dashboardSectionEyebrowClass}>{eyebrow}</p> : null}
            {(title || description || leading) ? (
              <div className={cn('mt-1', leading ? 'flex items-start gap-3' : 'block')}>
                {leading ? <div className="shrink-0 pt-0.5">{leading}</div> : null}
                <div className="min-w-0 flex-1">
                  {title ? <h3 className={cn(titleClassName)}>{title}</h3> : null}
                  {description ? <p className={cn('mt-1', descriptionClassName)}>{description}</p> : null}
                </div>
              </div>
            ) : null}
          </div>
          {trailing ? <div className="shrink-0">{trailing}</div> : null}
        </div>
      ) : null}

      {children ? (
        <div className={cn(hasHeader ? 'px-5 pb-5 pt-4 sm:px-6 sm:pb-6' : 'p-5 sm:p-6', bodyClassName)}>
          {children}
        </div>
      ) : null}

      {footer ? (
        <div className={cn('border-t border-slate-200/80 px-5 py-4 sm:px-6', footerClassName)}>
          {footer}
        </div>
      ) : null}
    </DashboardSurface>
  );
}

type DashboardKpiCardProps = {
  icon: DashboardIconComponent;
  label: ReactNode;
  value: ReactNode;
  subLabel?: ReactNode;
  badge?: ReactNode;
  className?: string;
  iconContainerClassName?: string;
  iconClassName?: string;
  valueClassName?: string;
  labelClassName?: string;
};

export function DashboardKpiCard({
  icon: Icon,
  label,
  value,
  subLabel,
  badge,
  className,
  iconContainerClassName,
  iconClassName,
  valueClassName,
  labelClassName,
}: DashboardKpiCardProps) {
  return (
    <div className={cn(
      'group rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_26px_60px_rgba(15,23,42,0.10)]',
      className,
    )}>
      <div className="mb-2 flex items-center justify-between sm:mb-4">
        <div className={cn(
          'flex h-9 w-9 items-center justify-center rounded-2xl ring-1 ring-slate-100 shadow-sm transition-transform duration-200 group-hover:scale-105 sm:h-10 sm:w-10',
          iconContainerClassName,
        )}>
          <Icon className={cn('h-4 w-4 sm:h-5 sm:w-5', iconClassName)} />
        </div>
        {badge ? badge : null}
      </div>
      <div className={cn('mb-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[2rem]', valueClassName)}>
        {value}
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('text-sm leading-6 text-slate-500', labelClassName)}>{label}</span>
        {subLabel ? subLabel : null}
      </div>
    </div>
  );
}

export function DashboardStatCard(props: DashboardKpiCardProps) {
  return <DashboardKpiCard {...props} />;
}
