import { getCustomIdAndRefreshTokens } from 'src/firebaseAdmin'
import { setCookie } from 'src/cookies'
import { getUserCookieName, getUserTokensCookieName } from 'src/authCookies'
import { getConfig } from 'src/config'
import logDebug from 'src/logDebug'
import createUser, { User } from 'src/createUser'
import { NextApiRequest, NextApiResponse } from 'next'

export type SetAuthCookies = (
  req: NextApiRequest,
  res: NextApiResponse,
  options?: { token?: string }
) => Promise<{
  idToken: string | null
  refreshToken: string | null
  user: User
}>

const setAuthCookies: SetAuthCookies = async (
  req: NextApiRequest,
  res: NextApiResponse,
  { token: userProvidedToken }: { token?: string } = {}
) => {
  logDebug('[setAuthCookies] Attempting to set auth cookies.')

  // This should be the original Firebase ID token from
  // the Firebase JS SDK.
  const token = userProvidedToken || req.headers.authorization
  if (!token) {
    throw new Error(
      'The request must have an Authorization header value, or you should explicitly provide an ID token to "setAuthCookies".'
    )
  }

  // Get a custom ID token and refresh token, given a valid Firebase ID
  // token. If the token isn't valid, set cookies for an unauthenticated
  // user.
  let idToken = null
  let refreshToken = null
  let user = createUser() // default to an unauthed user
  try {
    ;({ idToken, refreshToken, user } = await getCustomIdAndRefreshTokens(
      token
    ))
  } catch (e) {
    logDebug(
      '[setAuthCookies] Failed to verify the ID token. Cannot authenticate the user or get a refresh token.'
    )
  }

  // Pick a subset of the config.cookies options to
  // pass to setCookie.
  const cookieOptions = (({
    domain,
    httpOnly,
    keys,
    maxAge,
    overwrite,
    path,
    sameSite,
    secure,
    signed,
  }) => ({
    domain,
    httpOnly,
    keys,
    maxAge,
    overwrite,
    path,
    sameSite,
    secure,
    signed,
  }))(getConfig().cookies)

  // Store the ID and refresh tokens in a cookie. This
  // cookie will be available to future requests to pages,
  // providing a valid Firebase ID token (refreshed as needed)
  // for server-side rendering.
  setCookie(
    getUserTokensCookieName(),
    // Note: any change to cookie data structure needs to be
    // backwards-compatible.
    JSON.stringify({
      idToken,
      refreshToken,
    }),
    { req, res },
    cookieOptions
  )

  // Store the user data. This cookie will be available
  // to future requests to pages, providing the user data. It
  // will *not* include a Firebase ID token, because it may have
  // expired, but provides the user data without any
  // additional server-side requests.
  setCookie(
    getUserCookieName(),
    // Note: any change to cookie data structure needs to be
    // backwards-compatible.
    // Don't include the token in the user cookie, because
    // the token should only be used from the "userTokens"
    // cookie. Here, it is redundant information, and we don't
    // want the token to be used if it's expired.
    user.serialize({ includeToken: false }),
    {
      req,
      res,
    },
    cookieOptions
  )

  if (user.id) {
    logDebug('[setAuthCookies] Set auth cookies for an authenticated user.')
  } else {
    logDebug(
      '[setAuthCookies] Set auth cookies. The user is not authenticated.'
    )
  }

  return {
    idToken,
    refreshToken,
    user,
  }
}

export default setAuthCookies
