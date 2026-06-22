import type { NextPageContext } from 'next'

type ErrorProps = {
  statusCode?: number
}

function ErrorPage({ statusCode }: ErrorProps) {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Something went wrong</h1>
      <p>{statusCode ? `A server error ${statusCode} occurred.` : 'An unexpected client error occurred.'}</p>
    </main>
  )
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode || err?.statusCode || 500
  return { statusCode }
}

export default ErrorPage
