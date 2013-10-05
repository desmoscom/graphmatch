// Like setInterval, but only for functions that return a deferred. Will
// wait for the deferred to resolve or be rejected before running again.
var runEvery = function (fn, wait) {
  var runAndContinue = function () {
    fn().always(function () {
      setTimeout(runAndContinue, wait);
    });
  };
  runAndContinue();
};