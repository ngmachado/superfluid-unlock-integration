const expectedRevert = async (
  fn,
  revertMsg,
  printError = false,
  nestedError = false
) => {
  try {
    await fn;
    return false;
  } catch (err) {
    if (printError) console.log(err);
    if (nestedError) {
      return err.errorObject.errorObject.error.toString().includes(revertMsg);
    }
    return err.toString().includes(revertMsg);
  }
};

module.exports = {
  expectedRevert,
}