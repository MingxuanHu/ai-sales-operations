export type SalesRange = { startDate: string; endDate: string }
type Ranking = { id: string; name: string; netSales: string }

export type SalesReport = SalesRange & {
  fulfilledOrderCount: number
  netSales: string
  daily: { date: string; netSales: string }[]
  products: (Ranking & { casesSold: number })[]
  customers: Ranking[]
}

export function createSalesReportApi(request: <T>(path: string, options?: RequestInit) => Promise<T>) {
  return (organisationId: string, range: SalesRange, signal: AbortSignal) => {
    // URLSearchParams encodes the date filters for the authenticated request.
    const query = new URLSearchParams(range)
    return request<SalesReport>(`/organisations/${encodeURIComponent(organisationId)}/reports/sales?${query}`, { signal })
  }
}

export type SalesReportApi = ReturnType<typeof createSalesReportApi>
