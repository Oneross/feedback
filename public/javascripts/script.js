var app = angular.module('pelias', []);

app.run(function($rootScope) {});

app.controller('SearchController', function($scope, $rootScope, $sce, $http) {
  
  var default_zoom = 2;

  $scope.map = L.map('map', {
      zoom: default_zoom,
      center: [0,0],
      maxBounds: L.latLngBounds(L.latLng(-80, -180), L.latLng(82, 180))
  });

  L.tileLayer('//{s}.tiles.mapbox.com/v3/randyme.i0568680/{z}/{x}/{y}.png', {
      attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
      maxZoom: 18,
      minZoom: 2,
      noWrap: true
  }).addTo($scope.map);
  $scope.map_class = 'initial_state';

  $scope.search = '';
  $scope.searchresults = [];
  $scope.searchType = 'fine';
  $scope.api_url = '//pelias.mapzen.com';
  $scope.feedback_url = '/';
  $scope.resultsSelected = 0;
  $scope.button = {
    class: 'hidden',
    text: ''
  }
  $scope.log={};
  $scope.attempt =0;

  var not_found = {
    class: 'btn-danger',
    text: 'Not Found'
  };

  var not_found_in_pelias = not_found.text + ' in pelias? Click here to search other sources';
  var not_found_in_nominatum = not_found.text + ' in other sources either? Click here to report';
  var calling_nominatum = 'Please wait, Searching other sources..';
  var uploading_feedback= 'Sending your feedback! Thank you again';

  var found = {
    class: 'btn-success',
    text: 'Click here to send us your feedback. Thank you!'
  };

  var highlight = function( text, focus ){
    var r = RegExp( '('+ focus + ')', 'gi' );
    return text.replace( r, '<strong>$1</strong>' );
  }

  var getResults = function(url, resultkey) {
    var params = {
      input: $scope.search,
      // datasets: $scope.queryDatasets.join(','),
      size: 10
    }
    
    $http({
      url: $scope.api_url+url,
      method: 'GET',
      params: params,
      headers: { 'Accept': 'application/json' }
    }).success(function (data, status, headers, config) {
      if( data ){
        $scope.log = {};
        $scope.attempt = 0;
        $scope[resultkey].length = 0;
        $scope.resultsSelected = 0;
        $scope[resultkey] = data.features.map( function( res ){
          var text = res.properties.text + ((res.properties.alpha3 && (res.properties.text !== res.properties.admin0)) ? ', '+ res.properties.alpha3 : '');
          res.htmltext = $sce.trustAsHtml(highlight( text, $scope.search ));
          res.icon = 'unchecked';
          res.type = res.properties.type;
          return res;
        });
        $scope.button.class = not_found.class;
        $scope.button.text  = not_found_in_pelias;
      }
      else {
        $scope[resultkey] = [];
      }
    }).error(function (data, status, headers, config) {
      $scope[resultkey] = [];
    });
  };

  var getResultsFromNominatum = function(resultkey) {
    var params = {
      q: $scope.search,
      format: 'json'
    };
    resultkey = resultkey || 'searchresults';

    $http({
      url: 'http://nominatim.openstreetmap.org/search',
      method: 'GET',
      params: params,
      headers: { 'Accept': 'application/json' }
    }).success(function (data, status, headers, config) {
      if( data ){
        $scope[resultkey].length = 0;
        $scope.resultsSelected = 0;
        $scope[resultkey] = data.map( function( res ){
          res.htmltext = $sce.trustAsHtml(highlight( res.display_name, $scope.search ));
          res.icon = 'unchecked';
          return res;
        });
      }
      else {
        $scope[resultkey] = [];
      }
      $scope.button.class = not_found.class;
      $scope.button.text  = not_found_in_nominatum;
    }).error(function (data, status, headers, config) {
      $scope[resultkey] = [];
      $scope.button.class = not_found.class;
      $scope.button.text  = not_found_in_nominatum;
    });
  }
  $scope.selectResult = function( result, changeQuery ){
    if (result.icon === 'unchecked') {
      $scope.resultsSelected++;
      result.icon = 'check';
    } else {
      $scope.resultsSelected--;
      result.icon = 'unchecked';
    }
    $scope.button.class = $scope.resultsSelected > 0 ? found.class : not_found.class;
    $scope.button.text  = $scope.resultsSelected > 0 ? found.text : not_found.text;    
  }

  $rootScope.$on( 'hideall', function( ev ){
    $scope.searchresults = []
  });

  $rootScope.$on( 'hidesearch', function( ev ){
    $scope.searchresults = [];
  });

  $scope.keyPressed = function(ev) {
    if (ev.which == 13) {
      $scope.fullTextSearch();
    } else {
      // set default map
      remove_markers();
      $scope.map.setView(L.latLng(0,0), default_zoom);
    }
  }

  $scope.onFocus = function(ev) {
    // $("#searchresults").removeClass("smaller");
  }

  $scope.onBlur = function(ev) {
    // $("#searchresults").addClass("smaller");
  }

  $scope.fullTextSearch = function(){
    var url = $scope.searchType.toLowerCase() === 'fine' ? '/search' : '/search/coarse';
    getResults(url, 'searchresults');
  }

  var markers = [];
  var remove_markers = function(){
    for (i=0; i<markers.length; i++) {
      $scope.map.removeLayer(markers[i]);
    }
    markers = [];
  };

  var add_marker = function(geo, text) {
    var marker;

    if (typeof text == 'string') {
      marker = new L.marker(geo).bindPopup(text); 
    } else if (typeof text == 'object') {
      var full_text = '';
      for (key in text){
        full_text += ('<span class=\'key\'>' + key + '</span>: ' + text[key] + '<br/>');
      }
      marker = new L.marker(geo).bindPopup(full_text); 
    }
    
    $scope.map.addLayer(marker);
    markers.push(marker);
    marker.openPopup();
  };

  $scope.getZoom = function(layer) {
    // layer can be geoname,osmnode,osmway,admin0,admin1,admin2,
    // neighborhood,osmaddress,openaddresses,admin,address,poi

    var isAdmin = layer.indexOf('admin') !== -1;
    var isPoint = layer.indexOf('address') !== -1 || layer.indexOf('osm') !== -1;
    var zoom = default_zoom;

    if (isAdmin) {
      zoom = 5;
    } else if (isPoint) {
      zoom = 14;
    } else {
      zoom = 10;
    }

    return zoom;
  };

  $scope.showMap = function($event, result) {
    $scope.map_class = '';
    remove_markers();
    $('.glyphicon-map-marker').removeClass('selected');
    $($event.currentTarget).find('i').addClass('selected');
    if (result.geometry) {
      var geo = [result.geometry.coordinates[1],result.geometry.coordinates[0]];
      $scope.map.setView(geo, $scope.getZoom(result.properties.layer));
      add_marker(geo, result.properties);
    } else {
      var geo = [result.lat,result.lon];
      $scope.map.setView(geo, 10);
      add_marker(geo, result.display_name);
    }
  };

  $scope.giveFeedback = function(button_class) {
    var success = button_class === found.class;
    
    if ($scope.attempt === 0) {
      var searchresults = $scope.searchresults.map(function(res) {
        return {
          type: res.type,
          geometry: res.geometry,
          properties: res.properties,
          icon: res.icon
        }
      });
      $scope.log = {
        query: $scope.search,
        found: success,
        results: searchresults
      };
      
      $scope.log.foundInPelias = success;
      if (!success) {
        //call nominatum
        $scope.button.class = found.class;
        $scope.button.text  = calling_nominatum;  
        getResultsFromNominatum();
      }
    } else {
      // logging nominatum
      var searchresults = $scope.searchresults;
      $scope.log.found = success;
      $scope.log.nominatum_results = searchresults;
    }

    $scope.attempt++;

    if (success) {
      $scope.log.selected = searchresults.filter(function(res){
        return res.icon === 'check';
      });
    }

    if (success || $scope.attempt===2) {
      // upload logs
      $http({
        url: $scope.feedback_url + 'upload',
        method: 'POST',
        params: {'log': $scope.log},
        headers: { 'Accept': 'application/json' }
      }).success(function (data, status, headers, config) {
        $scope.button.class = found.class;
        $scope.button.text  = uploading_feedback;
        resetScope(); 
      }).error(function (data, status, headers, config) {
        console.log(data);
        resetScope();
      });

      var resetScope = function() {
        // reset
        $scope.search = '';
        $scope.searchresults = [];
        $scope.resultsSelected = 0;
        $scope.button = {
          class: 'hidden',
          text: ''
        }
        $scope.log={};
        $scope.attempt =0;
        $scope.map_class='initial_state';
      }
    }
  }

})
