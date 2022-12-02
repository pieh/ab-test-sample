const express = require(`express`)
const proxy = require(`express-http-proxy`)
const cookieParser = require("cookie-parser")

const mainPort = 9500

const app = express()

function createRewritesForVariants(dictionary) {
  for (const [_, config] of Object.entries(dictionary)) {
    for (const to of Object.values(config)) {
      dictionary[to] = config
    }
  }

  return dictionary
}

// we are creating rewrites not just for canonical path (`/hello-world/`),
// but also for each variant (`/hello-world/variant-a/`, `/hello-world/variant-b/`):
// After serving html it would contain `windo.pagePath = "/hello-world/variant-a/"` (or `/hello-world/variant-b/`)
// this instruct gatsby to fetch page-data for one of the variants (first one in in the array of variants will win)
// so we also have to rewrite `/hello-world/variant-(a,b)/page-data.json` to either variant-a or variant-b (depending on cookie)
const dictionary = createRewritesForVariants({
  ["/hello-world/"]: {
    a: `/hello-world/variant-a/`,
    b: `/hello-world/variant-b/`,
  },
  ["/page-data/hello-world/page-data.json"]: {
    a: `/page-data/hello-world/variant-a/page-data.json`,
    b: `/page-data/hello-world/variant-b/page-data.json`,
  },
})

console.log(`final rewrite dictionary`, dictionary)

app.use(cookieParser())

app.use(
  `/`,
  proxy(`http://localhost:9000`, {
    proxyReqPathResolver: req => {
      const abConfig = dictionary[req.url]
      if (!abConfig) {
        return req.originalUrl
      }

      let variant = req.cookies[`ab-test-variant`]
      if (!variant) {
        variant = Math.random() <= 0.5 ? "a" : "b"
        req.variant = variant
      }

      const selectedVariant = abConfig[variant]
      return selectedVariant
    },
    userResHeaderDecorator: (headers, userReq, userRes, proxyReq, proxyRes) => {
      const variant = userReq.variant
      if (variant) {
        headers[`Set-Cookie`] = `ab-test-variant=${variant}; Path=/`
      }

      return headers
    },
  })
)

app.listen(mainPort, `localhost`, () => {
  console.log(
    `\nDon't use regular serve URL - use this one http://localhost:${mainPort}/`
  )
})
