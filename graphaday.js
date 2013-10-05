$(function() {
  
  //the data for the 3 examples on the left side
  var levels = [
    {
      title: "easy",
      xmin: -9,
      xmax: 9,
      ymin: -9,
      ymax: 9,
      latex: 'y=x+4',
      success: false
    },
    {
      title: "medium",
      xmin: -9,
      xmax: 9,
      ymin: -9,
      ymax: 9,
      latex: 'y=.5\\left(x-4\\right) \\left(x+2\\right)',
      success: false
    },
    {
      title: "hard",
      xmin: -75,
      xmax: 820,
      ymin: -15,
      ymax: 55,
      latex: '\\sqrt{x}+10\\sin \\left(\\sqrt{x}\\right)',
      success: false
    }
  ];
  
  /*
   * populate the list of challenges on the left
   */


  var setTargetColor = function (success) {
    var incorrectColor = '#faa';
    var correctColor = '#99d4b9';

    var color = (success ? correctColor : incorrectColor);

    grapher.setExpression({
      id: 'answer',
      color: color
    });
  };

  _.each(levels, function(level, i) {
    $("<div>").addClass('option').attr('index', i).addClass(level.title).text(level.title).on('click',  function() {
      
      $('.btn.submit').removeClass('hidden');
      $('.btn.correct').addClass('hidden');

      //set the expression & viewport for the selected challenge
      grapher.setExpression({
        id: 'answer',
        latex: level.latex
      });
      grapher.setExpression({
        id: 'guess',
        latex: ''
      });
      setTargetColor(levels[i].success);

      grapher.setViewport([level.xmin, level.xmax, level.ymin, level.ymax]);
      
      //cache the latex that is currently being viewed
      $('.option.selected').attr('cachedLatex', guess.mathquill('latex'));
      
      //read the latex for the option you're switching to
      var cachedLatex = $(this).attr('cachedLatex') || 'y=';
      guess.mathquill('latex', cachedLatex);
      
      //set the selected class
      $('.option').removeClass('selected');
      $(this).addClass('selected');
      guess.mathquill('focus');
    }).appendTo("#leftbar");
  });


  /*
   * take our mathquill and bind it to the "guess" equation in our grapher
   * also check, on every change, whether we match the target function, and update UI if we do
   */
  var guess = $('#guess').mathquill('editable');

  guess.on('render', function () {
    console.log("is blank", (guess.mathquill('latex') == 'y='));
    $('.submit').toggleClass('disabled', (guess.mathquill('latex') === 'y='));
  });

  var checkAnswer = function () {
    var guessLatex = guess.mathquill('latex');

    //update the curve
    grapher.setExpression({
      id:'guess',
      latex: guessLatex
    });
    $('.btn.submit').addClass('hidden');

    setTimeout(function() {
      var success = grapher.doesMatch('guess', 'answer');
      var index = parseInt($('.selected').attr('index'), 10);
      levels[index].success = success;
      setTargetColor(success);
      if (success) {
        $('.btn.correct').removeClass('hidden');
      } else {
        $('.btn.incorrect').removeClass('hidden');

        setTimeout(function() {
          $('.btn.incorrect').addClass('hidden');
          $('.btn.submit').removeClass('hidden');
          grapher.setExpression({
            id: 'guess',
            latex: ''
          });
        }, 1500);
      }
    }, 200);
  };

  guess.bind('enterPressed', checkAnswer);
  $('.submit').on('click', checkAnswer);

  /*
   * called when the graph is successfully embedded
   * populate the graph, set the initial expression, and show everything
   */
  

  var grapher = new Desmos.Graphpaper(document.getElementById('grapher'));
  //populate the graph
  grapher.setExpression({ id: 'answer', latex: '', color: "#faa"});
  grapher.setExpression({ id: 'guess', latex: '', color: "#009551"});
  $('.option.easy').trigger('click');
  $('.loading').addClass('loaded');
  guess.mathquill('focus');
});