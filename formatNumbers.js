//from: http://stackoverflow.com/questions/2901102/how-to-print-a-number-with-commas-as-thousands-separators-in-javascript
var numberWithCommas = function(x) {
  if (!isFinite(x)) return "";
  return Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};