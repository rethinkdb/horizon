/* Pulled from @sindresorhus query-string module and reformatted.
This is simply to avoid requiring the other methods in the module.

MIT License © Sindre Sorhus
*/

export type URIMapVal = null | string | Array<string|null>

export interface URIMap {
  [ index: string ]: URIMapVal
}

export function queryParse(str: any): URIMap {
  if (typeof str !== 'string') {
    return {}
  }

  const str2 = str.trim().replace(/^(\?|#|&)/, '')

  if (!str2) {
    return {}
  }

  return str2.split('&').reduce((ret: URIMap, param: string): URIMap => {
    const parts = param.replace(/\+/g, ' ').split('=')
    // Firefox (pre 40) decodes `%3D` to `=`
    // https://github.com/sindresorhus/query-string/pull/37
    const key = parts.shift()
    if (key !== undefined) {
      const val = parts.length > 0 ? parts.join('=') : undefined

      const key2 = decodeURIComponent(key)

      // missing `=` should be `null`:
      // http://w3.org/TR/2012/WD-url-20120524/#collect-url-parameters
      const val2 = val === undefined ? null : decodeURIComponent(val)


      if (ret[key2] === null || !ret.hasOwnProperty(key2)) {
        ret[key2] = val2
      } else {
        const retkey2 = ret[key2]
        if (Array.isArray(retkey2)) {
          retkey2.push(val2)
        } else {
          ret[key2] = [ retkey2, val2 ]
        }
      }
    }
    return ret
  }, {})
}
