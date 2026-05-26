const getSessionCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 24 * 60 * 60 * 1000,
});

const getClearSessionCookieOptions = () => {
  const { maxAge, ...options } = getSessionCookieOptions();
  return options;
};

module.exports = {
  getSessionCookieOptions,
  getClearSessionCookieOptions,
};
