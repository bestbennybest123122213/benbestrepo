// Extract Email Health Metrics from SmartLead GraphQL API
const https = require('https');

// The JWT token from localStorage (base64 decoded)
const localStorageData = JSON.parse(Buffer.from('IntcImh0dHBMb2FkaW5nXCI6ZmFsc2UsXCJjYW1wYWlnbkZvcm1cIjp7fSxcImFsbFRhZ3NcIjpbXSxcImFsbExlYWRDYXRlZ29yaWVzXCI6W10sXCJwYXJlbnRDYW1wYWlnbkJ5SWREYXRhXCI6e30sXCJhcHBTZWxlY3RlZFR1dG9yaWFsXCI6XCJcIixcImxlYWRCeUlkTm90ZVRhc2tzUHJvcHNcIjp7fSxcIm9uYm9hcmRpbmdOb3REb25lXCI6dHJ1ZSxcImF1dGhcIjp7XCJ0b2tlblwiOlwiZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SjFjMlZ5SWpwN0luUmxZVzFmYldWdFltVnlYMlZ0WVdsc0lqb2lZbVZ1ZEdobFltVnpkR0Z6YzJsemRHRnVkREV5TWtCbmJXRnBiQzVqYjIwaUxDSjBaV0Z0WDIxbGJXSmxjbDlwWkNJNk1UQTFOemMwTlN3aWRHVmhiVjl0WlcxaVpYSmZibUZ0WlNJNkltSmxiaUlzSW5SbFlXMWZiV1Z0WW1WeVgzVjFhV1FpT2lKbU5tSmhZVEEzWkMwMk1qSmlMVFExTTJFdFlUUXpNUzFrTnpVM09HUm1NR1k1WlRRaUxDSjBaV0Z0WDIxbGJXSmxjbDkxYzJWeVgybGtJam95TnpnMk9UVXNJblJsWVcxZmJXVnRZbVZ5WDNKdmJHVWlPaUpXU1VWWFgwOU9URmxmUVVORFJWTlRJaXdpYVdRaU9qSTNPRFk1TlN3aWRYVnBaQ0k2SW1FelpEY3hPRE5oTFRKbU56UXRORGhsWXkwNU5UVmpMV015TUdJeE1EUTVaakV3WVNJc0ltVnRZV2xzSWpvaWFXMXRZVzVBYVhSemMybHRZVzV1Ym5SMkxtTnZiU0lzSW01aGJXVWlPaUpKYlcxaGJpQk5ZMHhoZFhKcGJpSXNJblJ2YTJWdVgzWmxjbk5wYjI0aU9qQjlMQ0pvZEhSd2N6b3ZMMmhoYzNWeVlTNXBieTlxZDNRdlkyeGhhVzF6SWpwN0luZ3RhR0Z6ZFhKaExXRnNiRzkzWldRdGNtOXNaWE1pT2xzaWRHVmhiVjl0WlcxaVpYSnpJbDBzSW5ndGFHRnpkWEpoTFdSbFptRjFiSFF0Y205c1pTSTZJblJsWVcxZmJXVnRZbVZ5Y3lJc0luZ3RhR0Z6ZFhKaExYUmxZVzB0YldWdFltVnlMV2xrSWpvaU1UQTFOemMwTlNJc0luZ3RhR0Z6ZFhKaExYUmxZVzB0YldWdFltVnlMWFYxYVdRaU9pSm1ObUpoWVRBM1pDMDJNakppTFRRMU0yRXRZVFF6TVMxa056VTNPR1JtTUdZNVpUUWlMQ0o0TFdoaGMzVnlZUzEwWldGdExXMWxiV0psY2kxdVlXMWxJam9pWW1WdUlpd2llQzFvWVhOMWNtRXRkR1ZoYlMxdFpXMWlaWEl0WlcxaGFXd2lPaUppWlc1MGFHVmlaWE4wWVhOemFYTjBZVzUwTVRJeVFHZHRZV2xzTG1OdmJTSXNJbmd0YUdGemRYSmhMWFJsWVcwdGJXVnRZbVZ5TFhKdmJHVWlPaUpXU1VWWFgwOU9URmxmUVVORFJWTlRJaXdpZUMxb1lYTjFjbUV0ZFhObGNpMXBaQ0k2SWpJM09EWTVOU0lzSW5ndGFHRnpkWEpoTFhWelpYSXRkWFZwWkNJNkltRXpaRGN4T0ROaExUSm1OelF0TkRobFl5MDVOVFZqTFdNeU1HSXhNRFE1WmpFd1lTSXNJbmd0YUdGemRYSmhMWFZ6WlhJdFpXMWhhV3dpT2lKcGJXMWhia0JwZEhOemFXMWhibTV1ZEhZdVkyOXRJaXdpZUMxb1lYTjFjbUV0ZFhObGNpMXVZVzFsSWpvaVNXMXRZVzRnVFdOTVlYVnlhVzRpTENKNExXaGhjM1Z5WVMxMGIydGxiaTEyWlhKemFXOXVJam9pTUNKOUxDSnBZWFFpT2pFM056TTFNVE14TVRaOS4zek9oajFGamdsZmMtdlFIenNiLThWQmtSZ1JWVk40Nnc4a0pneTFUTHdRXCIsXCJ1bnN1YlRva2VuXCI6XCJcIn0=', 'base64').toString());

const token = localStorageData.auth.token;
console.log('Token extracted, length:', token.length);

// Test a simple GraphQL query to get the schema or available queries
const testQuery = {
  query: `
    query GetEmailHealthMetrics($startDate: String!, $endDate: String!) {
      analytics_email_health_metrics(startDate: $startDate, endDate: $endDate) {
        mailboxes {
          email
          leadContacted
          emailSent
          opened
          replied
          positiveReply
          bounce
        }
      }
    }
  `,
  variables: {
    startDate: "2026-02-15",
    endDate: "2026-03-16"
  }
};

console.log('Token first 50 chars:', token.substring(0, 50));
