/**
 * Order hub types for Electron CRM / NEXDOT / T&E order modules (web parity).
 */

/** Origin of an order in public.orders: manual CRM entry or ERP mirror. */
export type OrderRecordSource = 'crm' | 'erp'

/** ERP order index row linked to a customer (read-only in CRM). */
export interface Order {
  id: string
  customerId: string
  groupId: string | null
  productName: string
  createdAt: string
  /** Order origin; CRM lists ERP-mirrored rows only. */
  source: OrderRecordSource
  /** ERP order number (BillNo). */
  externalId?: string | null
  /** ERP order status summary (e.g. posted/checked/pending). */
  status?: string | null
  /** ERP order bill date (ISO string). */
  billDate?: string | null
  /** ERP order total, flattened from the ERP header (null until synced or for CRM-manual rows). */
  amount?: number | null
  /** ERP order currency code. */
  currency?: string | null
  /** Joined customer company name for list display. */
  companyName?: string | null
  /** Joined customer code for list display. */
  customerCode?: string | null
  /** Joined CRM group name for list display. */
  groupName?: string | null
}

/** Result of an ERP index sync triggered from Orders. */
export interface ErpSyncResult {
  customers: number
  orders: number
  failed: number
}

/** A line item inside a full ERP order (SaleOrderSub element). */
export interface ErpOrderLineItem {
  [key: string]: unknown
}

/** Full ERP order detail payload (SaleOrder + SaleOrderSub[]) from GetSaleOrder. */
export interface ErpOrderDetailPayload {
  SaleOrder?: Record<string, unknown> | Record<string, unknown>[]
  SaleOrderSub?: ErpOrderLineItem[]
  [key: string]: unknown
}

/** Payment lifecycle states for a `shop_orders` row. */
export type ShopOrderPaymentStatus =
  | 'pending_payment'
  | 'payment_processing'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'closed'
  | 'cancelled'

/** NEXDOT wholesale order row (`shop_orders`), read-only. */
export interface ObmOrder {
  id: string
  orderNumber: string
  customerId: string | null
  groupId: string | null
  paymentStatus: ShopOrderPaymentStatus
  itemCount: number
  /** Order total in whole currency units (e.g. USD dollars), not cents. */
  totalAmount: number | null
  currency: string
  createdAt: string
  updatedAt: string
  /** Joined customer company name for list display. */
  companyName?: string | null
}

/** Frozen address snapshot stored on `shop_orders` at checkout time. */
export interface ObmOrderAddressSnapshot {
  firstName: string
  lastName: string
  phone: string
  email: string
  country: string
  state: string
  city: string
  postalCode: string
  district: string
  line1: string
  line2: string
}

/** One frozen line on `shop_order_items`. */
export interface ObmOrderLineItem {
  id: string
  productId: string
  itemCode: string
  name: string
  unitPrice: number
  quantity: number
  lineTotal: number
}

/** One recorded Stripe payment for a shop order (`shop_payments`). */
export interface ObmOrderPayment {
  id: string
  stripeCheckoutSessionId: string
  stripePaymentIntentId: string | null
  status: string
  amount: number | null
  currency: string
  paidAt: string | null
  customerEmail: string | null
}

/** Full NEXDOT order for the detail pane (header + addresses + lines). */
export interface ObmOrderDetail extends ObmOrder {
  dealerAccountId: string | null
  clientPlatform: string | null
  subtotalAmount: number | null
  paymentStatusChangedAt: string | null
  closedAt: string | null
  cancelledAt: string | null
  shippingAddress: ObmOrderAddressSnapshot | null
  billingAddress: ObmOrderAddressSnapshot | null
  items: ObmOrderLineItem[]
  payments: ObmOrderPayment[]
}

/** Normalized carrier state stored on a local T&E order. */
export type TeOrderTrackingStatus = 'pending' | 'in_transit' | 'delivered'

/** A backend-owned local T&E order (one per `te_submissions` row). */
export interface TeOrder {
  id: string
  teSubmissionId: string
  communityAccountId: string | null
  approvedProductIds: string[]
  orderCreatedAt: string
  trackingNumber: string | null
  carrier: string | null
  trackerId: string | null
  trackerRegisteredAt: string | null
  trackingStatus: TeOrderTrackingStatus | null
  trackingStatusUpdatedAt: string | null
  trackingLastCheckedAt: string | null
  trackingNextCheckAt: string | null
  trackingFailureCount: number
  trackingLastError: string | null
  shippedAt: string | null
  deliveredAt: string | null
  source: string
  createdAt: string
  updatedAt: string
}

/** A Stripe Checkout payment for a T&E evaluation purchase. */
export interface TePayment {
  id: string
  teSubmissionId: string
  teCheckoutAttemptId: string
  stripeCheckoutSessionId: string
  stripePaymentIntentId: string | null
  amountCents: number
  currency: string
  status: 'paid' | 'refunded'
  lineItems: Array<{
    productId?: string
    name: string
    amountCents: number
    amountUsd: number
  }>
  customerEmail: string | null
  paidAt: string
  createdAt: string
}

/** Paginated list result shared by order list APIs. */
export interface OrdersListResult<T> {
  rows: T[]
  totalCount: number
}
