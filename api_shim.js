Desmos.Graphpaper.prototype.doesMatch = function(id1, id2) {
  //"ah, the old reacharound"
  var grapher = this._calc.grapher;

  if (!grapher.graphSketches[id1] || !grapher.graphSketches[id2]) return false;
  
  var fn1 = grapher.graphSketches[id1].branches[0].compiled.fn;
  var fn2 = grapher.graphSketches[id2].branches[0].compiled.fn;
  for (var i = 0 ; i < 10 ; i++) {
    if (isNaN(fn1(i)) !== isNaN(fn2(i))) return false;
    if (fn1(i) !== fn2(i)) return false;
  }
  return true;
};

Desmos.Graphpaper.prototype.doesPassThroughPoint = function(id, point) {
  var grapher = this._calc.grapher;
  if (!grapher.graphSketches[id]) return false;
  var fn = grapher.graphSketches[id].branches[0].compiled.fn;
  return (Math.abs(fn(point[0]) - point[1]) < 0.0000000000001);
};

Desmos.Graphpaper.prototype.highlightExpression = function (id) {
  var grapher = this._calc.grapher;
  if (!grapher.graphSketches.hasOwnProperty(id)) return;
  grapher.graphSketches[id].showHighlight = true;
  grapher.redrawPOILayer();
};

Desmos.Graphpaper.prototype.unhighlightExpression = function (id) {
  var grapher = this._calc.grapher;
  if (!grapher.graphSketches.hasOwnProperty(id)) return;
  grapher.graphSketches[id].showHighlight = false;
  grapher.redrawPOILayer();
};

Desmos.Graphpaper.prototype.unhighlightAll = function () {
  var grapher = this._calc.grapher;
  for (var id in grapher.graphSketches) {
    if (!grapher.graphSketches.hasOwnProperty(id)) continue;
    grapher.graphSketches[id].showHighlight = false;
  }
  grapher.redrawPOILayer();
};