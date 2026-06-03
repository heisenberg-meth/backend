export const sessionCache = new Map();
export const userCache = new Map();

export const invalidateSessionCache = (sessionId) => {
  if (sessionId) {
    sessionCache.delete(sessionId);
  } else {
    sessionCache.clear();
  }
};

export const invalidateUserCache = (userId) => {
  if (userId) {
    userCache.delete(userId);
  } else {
    userCache.clear();
  }
};
