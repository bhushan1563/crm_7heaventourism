/** May this person read a module's records? Admins always; otherwise the stored right, and with nothing stored "all data can be seen by any user", as everywhere else. */
export const mayRead = (req, moduleName) => {
  if (req.user && (req.user.role === 'Admin' || req.user.role === 'SuperAdmin')) return true;
  const rights = req.userRights?.[moduleName];
  return rights ? Boolean(rights.canRead) : true;
};

export default mayRead;
