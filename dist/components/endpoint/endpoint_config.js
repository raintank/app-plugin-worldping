"use strict";

System.register(["lodash"], function (_export, _context) {
  var _, _createClass, EndpointConfigCtrl;

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  return {
    setters: [function (_lodash) {
      _ = _lodash.default;
    }],
    execute: function () {
      _createClass = function () {
        function defineProperties(target, props) {
          for (var i = 0; i < props.length; i++) {
            var descriptor = props[i];
            descriptor.enumerable = descriptor.enumerable || false;
            descriptor.configurable = true;
            if ("value" in descriptor) descriptor.writable = true;
            Object.defineProperty(target, descriptor.key, descriptor);
          }
        }

        return function (Constructor, protoProps, staticProps) {
          if (protoProps) defineProperties(Constructor.prototype, protoProps);
          if (staticProps) defineProperties(Constructor, staticProps);
          return Constructor;
        };
      }();

      _export("EndpointConfigCtrl", EndpointConfigCtrl = function () {
        /** @ngInject */

        function EndpointConfigCtrl($scope, $injector, $location, $modal, $anchorScroll, $timeout, $window, backendSrv, alertSrv) {
          _classCallCheck(this, EndpointConfigCtrl);

          var self = this;
          this.backendSrv = backendSrv;
          this.$location = $location;
          this.alertSrv = alertSrv;
          this.pageReady = false;

          this.tabIndex = 0;

          this.monitorLastState = {};

          this.frequencyOpts = [];
          var freqOpt = [10, 30, 60, 120];
          _.forEach(freqOpt, function (f) {
            self.frequencyOpts.push({ value: f, label: "Every " + f + "s" });
          });

          this.timeoutRegex = /^([1-9](\.\d)?|10)$/;
          this.editor = { index: 0 };
          this.newEndpointName = "";
          this.endpoints = [];
          this.monitors = {};
          this.monitor_types = {};
          this.monitor_types_by_name = {};
          this.allCollectors = [];
          this.collectorsOption = { selection: "all" };
          this.collectorsByTag = {};
          this.global_collectors = { collector_ids: [], collector_tags: [] };
          this.ignoreChanges = false;
          this.originalState = {};

          var promises = [];
          if ("endpoint" in $location.search()) {
            promises.push(this.getEndpoints().then(function () {
              return self.getEndpoint($location.search().endpoint);
            }));
          } else {
            this.endpoint = { name: "" };
          }

          this.checks = {};

          promises.push(this.getCollectors());
          promises.push(this.getMonitorTypes());
          Promise.all(promises).then(function () {
            self.pageReady = true;
            self.reset();
            $timeout(function () {
              $anchorScroll();
            }, 0, false);
          });

          if ($location.search().check) {
            switch ($location.search().check) {
              case "ping":
                self.showPing = true;
                break;
              case "dns":
                self.showDNS = true;
                break;
              case "http":
                self.showHTTP = true;
                break;
              case "https":
                self.showHTTPS = true;
                break;
            }
          }

          $window.onbeforeunload = function () {
            if (self.ignoreChanges) {
              return;
            }
            if (self.changesPending()) {
              return "There are unsaved changes to this dashboard";
            }
          };

          $scope.$on('$locationChangeStart', function (event, next) {
            if (!self.ignoreChanges && self.changesPending()) {
              event.preventDefault();
              var baseLen = $location.absUrl().length - $location.url().length;
              var nextUrl = next.substring(baseLen);
              var modalScope = $scope.$new();
              modalScope.ignore = function () {
                self.ignoreChanges = true;
                $location.path(nextUrl);
                return;
              };

              modalScope.save = function () {
                self.save(nextUrl);
              };

              var confirmModal = $modal({
                template: './app/partials/unsaved-changes.html',
                modalClass: 'modal-no-header confirm-modal',
                persist: false,
                show: false,
                scope: modalScope,
                keyboard: false
              });

              Promise.resolve(confirmModal).then(function (modalEl) {
                modalEl.modal('show');
              });
            }
          });
        }

        _createClass(EndpointConfigCtrl, [{
          key: "getCollectors",
          value: function getCollectors() {
            var self = this;
            return this.backendSrv.get('api/plugin-proxy/worldping-app/api/collectors').then(function (collectors) {
              self.collectors = collectors;
              _.forEach(collectors, function (c) {
                self.allCollectors.push(c.id);
                _.forEach(c.tags, function (t) {
                  if (!(t in self.collectorsByTag)) {
                    self.collectorsByTag[t] = [];
                  }
                  self.collectorsByTag[t].push(c);
                });
              });
              self.global_collectors = { collector_ids: self.allCollectors, collector_tags: [] };
            });
          }
        }, {
          key: "collectorCount",
          value: function collectorCount(monitor) {
            var self = this;
            if (!monitor) {
              return 0;
            }
            var ids = {};
            _.forEach(monitor.collector_ids, function (id) {
              ids[id] = true;
            });
            _.forEach(monitor.collector_tags, function (t) {
              _.forEach(self.collectorsByTag[t], function (c) {
                ids[c.id] = true;
              });
            });
            return Object.keys(ids).length;
          }
        }, {
          key: "getMonitorTypes",
          value: function getMonitorTypes() {
            var self = this;
            return this.backendSrv.get('api/plugin-proxy/worldping-app/api/monitor_types').then(function (types) {
              var typesMap = {};
              _.forEach(types, function (type) {
                typesMap[type.id] = type;
                self.monitor_types_by_name[type.name.toLowerCase()] = type;
                self.setDefaultMonitor(type);
              });
              self.monitor_types = typesMap;
            });
          }
        }, {
          key: "setDefaultMonitor",
          value: function setDefaultMonitor(type) {
            var self = this;
            if (!(type.name.toLowerCase() in this.monitors)) {
              var settings = [];
              _.forEach(type.settings, function (setting) {
                var val = setting.default_value;
                if (self.endpoint && (setting.variable === "host" || setting.variable === "name" || setting.variable === "hostname")) {
                  val = self.endpoint.name || "";
                }
                settings.push({ variable: setting.variable, value: val });
              });
              self.monitors[type.name.toLowerCase()] = {
                id: null,
                endpoint_id: null,
                monitor_type_id: type.id,
                collector_ids: self.global_collectors.collector_ids,
                collector_tags: self.global_collectors.collector_tags,
                settings: settings,
                enabled: false,
                frequency: 10,
                health_settings: {
                  steps: 3,
                  num_collectors: 3,
                  notifications: {
                    enabled: false,
                    addresses: ""
                  }
                }
              };
            }
          }
        }, {
          key: "defaultSettingByVariable",
          value: function defaultSettingByVariable(monitorType, variable) {
            var s = null;
            var type = this.monitor_types_by_name[monitorType];
            _.forEach(type.settings, function (setting) {
              if (setting.variable === variable) {
                s = setting;
              }
            });
            return s;
          }
        }, {
          key: "currentSettingByVariable",
          value: function currentSettingByVariable(monitor, variable) {
            var s = {
              "variable": variable,
              "value": null
            };
            var found = false;
            _.forEach(monitor.settings, function (setting) {
              if (found) {
                return;
              }
              if (setting.variable === variable) {
                s = setting;
                found = true;
              }
            });
            if (!found) {
              monitor.settings.push(s);
            }
            if (s.value === null) {
              var type = this.monitor_types[monitor.monitor_type_id];
              _.forEach(type.settings, function (setting) {
                if (setting.variable === variable) {
                  s.value = setting.default_value;
                }
              });
            }

            return s;
          }
        }, {
          key: "reset",
          value: function reset() {
            var self = this;
            this.discovered = false;
            this.discoveryInProgress = false;
            this.discoveryError = false;
            this.showConfig = false;
            // $scope.endpoint.name = {"name": ""};
            this.monitors = {};
            _.forEach(self.monitor_types, function (type) {
              self.setDefaultMonitor(type);
            });
          }
        }, {
          key: "cancel",
          value: function cancel() {
            this.reset();
            this.ignoreChanges = true;
            window.history.back();
          }
        }, {
          key: "getEndpoints",
          value: function getEndpoints() {
            var self = this;
            return this.backendSrv.get('api/plugin-proxy/worldping-app/api/endpoints').then(function (endpoints) {
              self.endpoints = endpoints;
            });
          }
        }, {
          key: "getEndpoint",
          value: function getEndpoint(idString) {
            var self = this;
            var id = parseInt(idString);
            _.forEach(this.endpoints, function (endpoint) {
              if (endpoint.id === id) {
                self.endpoint = endpoint;
                self.newEndpointName = endpoint.name;
                //get monitors for this endpoint.
                self.backendSrv.get('api/plugin-proxy/worldping-app/api/monitors?endpoint_id=' + id).then(function (monitors) {
                  _.forEach(monitors, function (monitor) {
                    var type = self.monitor_types[monitor.monitor_type_id].name.toLowerCase();
                    if (type in self.monitors) {
                      _.assign(self.monitors[type], monitor);
                    } else {
                      self.monitors[type] = monitor;
                    }
                    self.monitorLastState[monitor.id] = _.cloneDeep(monitor);
                  });
                  self.pageReady = true;
                });
              }
            });
          }
        }, {
          key: "setEndpoint",
          value: function setEndpoint(id) {
            this.$location.url('plugins/worldping-app/page/endpoint-config?endpoint=' + id);
          }
        }, {
          key: "remove",
          value: function remove(endpoint) {
            var self = this;
            this.backendSrv.delete('api/plugin-proxy/worldping-app/api/endpoints/' + endpoint.id).then(function () {
              self.$location.path('plugins/worldping-app/page/endpoints');
            });
          }
        }, {
          key: "removeMonitor",
          value: function removeMonitor(mon) {
            var self = this;
            var type = this.monitor_types[mon.monitor_type_id];
            this.backendSrv.delete('api/plugin-proxy/worldping-app/api/monitors/' + mon.id).then(function () {
              self.setDefaultMonitor(type.name.toLowerCase());
              delete self.monitorLastState[mon.id];
            });
          }
        }, {
          key: "updateEndpoint",
          value: function updateEndpoint() {
            this.endpoint.name = this.newEndpointName;
            this.backendSrv.post('api/plugin-proxy/worldping-app/api/endpoints', this.endpoint);
          }
        }, {
          key: "save",
          value: function save(location) {
            var self = this;
            var promises = [];
            _.forEach(this.monitors, function (monitor) {
              monitor.endpoint_id = self.endpoint.id;
              if (monitor.id) {
                if (!angular.equals(monitor, self.monitorLastState[monitor.id])) {
                  promises.push(self.updateMonitor(monitor));
                }
              } else if (monitor.enabled) {
                promises.push(self.addMonitor(monitor));
              }
            });

            promises.push(self.backendSrv.post('api/plugin-proxy/worldping-app/api/endpoints', self.endpoint));
            Promise.all(promises).then(function () {
              if (location) {
                self.$location.path(location);
              } else {
                self.$location.path("plugins/worldping-app/page/endpoints");
              }
            });
          }
        }, {
          key: "addMonitor",
          value: function addMonitor(monitor) {
            var self = this;
            monitor.endpoint_id = this.endpoint.id;
            return this.backendSrv.put('api/plugin-proxy/worldping-app/api/monitors', monitor, true).then(function (resp) {
              _.defaults(monitor, resp);
              self.monitorLastState[monitor.id] = _.cloneDeep(monitor);
              var action = "disabled";
              if (monitor.enabled) {
                action = "enabled";
              }
              var type = self.monitor_types[resp.monitor_type_id];
              var message = type.name.toLowerCase() + " " + action + " successfully";
              self.alertSrv.set(message, '', 'success', 3000);
            });
          }
        }, {
          key: "updateMonitor",
          value: function updateMonitor(monitor) {
            var self = this;
            if (!monitor.id) {
              return this.addMonitor(monitor);
            }

            return this.backendSrv.post('api/plugin-proxy/worldping-app/api/monitors', monitor, true).then(function () {
              var type = self.monitor_types[monitor.monitor_type_id];
              var message = type.name.toLowerCase() + " updated";
              if (self.monitorLastState[monitor.id].enabled !== monitor.enabled) {
                var action = "disabled";
                if (monitor.enabled) {
                  action = "enabled";
                }
                message = type.name.toLowerCase() + " " + action + " successfully";
              }

              self.monitorLastState[monitor.id] = _.cloneDeep(monitor);
              self.alertSrv.set(message, '', 'success', 3000);
            });
          }
        }, {
          key: "parseSuggestions",
          value: function parseSuggestions(payload) {
            var self = this;
            var defaults = {
              endpoint_id: 0,
              monitor_type_id: 1,
              collector_ids: this.global_collectors.collector_ids,
              collector_tags: this.global_collectors.collector_tags,
              settings: [],
              enabled: true,
              frequency: 60,
              health_settings: {
                steps: 3,
                num_collectors: 3,
                notifications: {
                  enabled: false,
                  addresses: ""
                }
              }
            };
            _.forEach(payload, function (suggestion) {
              _.defaults(suggestion, defaults);
              var type = self.monitor_types[suggestion.monitor_type_id];
              if (type.name.indexOf("Ping") === 0) {
                suggestion.frequency = 10;
              }
              self.monitors[type.name.toLowerCase()] = suggestion;
            });
          }
        }, {
          key: "skipDiscovery",
          value: function skipDiscovery() {
            this.discoveryInProgress = false;
            this.showConfig = true;
            this.discoveryError = false;
          }
        }, {
          key: "discover",
          value: function discover(endpoint) {
            var self = this;
            this.discoveryInProgress = true;
            this.discoveryError = false;
            this.backendSrv.get('api/plugin-proxy/worldping-app/api/endpoints/discover', endpoint).then(function (resp) {
              if (!self.showConfig) {
                if (endpoint.name.indexOf("://") > -1) {
                  //endpoint name is in the form scheme://domain
                  var parser = document.createElement('a');
                  parser.href = endpoint.name;
                  endpoint.name = parser.hostname;
                }
                self.showConfig = true;
                self.discovered = true;
                self.parseSuggestions(resp);
              }
            }, function () {
              self.discoveryError = "Failed to discover endpoint.";
            }).finally(function () {
              self.discoveryInProgress = false;
            });
          }
        }, {
          key: "addEndpoint",
          value: function addEndpoint() {
            var self = this;
            if (this.endpoint.id) {
              return this.updateEndpoint();
            }

            var payload = this.endpoint;
            payload.monitors = [];
            _.forEach(this.monitors, function (monitor) {
              monitor.endpoint_id = -1;
              payload.monitors.push(monitor);
            });
            this.backendSrv.put('api/plugin-proxy/worldping-app/api/endpoints', payload).then(function (resp) {
              self.endpoint = resp;
              self.ignoreChanges = true;
              self.alertSrv.set("endpoint added", '', 'success', 3000);
              self.$location.path("worldping/endpoints/summary/" + resp.id);
            });
          }
        }, {
          key: "changesPending",
          value: function changesPending() {
            var self = this;
            var changes = false;
            _.forEach(this.monitors, function (monitor) {
              if (monitor.id === null) {
                return;
              }
              if (!angular.equals(monitor, self.monitorLastState[monitor.id])) {
                changes = true;
              }
            });
            return changes;
          }
        }, {
          key: "gotoDashboard",
          value: function gotoDashboard(endpoint, type) {
            var self = this;
            if (!type) {
              type = 'summary';
            }
            var search = {
              "var-collector": "All",
              "var-endpoint": this.endpoint.slug
            };
            switch (type) {
              case "summary":
                self.$location.path("/dashboard/db/worldping-endpoint-summary").search(search);
                break;
              case "ping":
                self.$location.path("/dashboard/db/worldping-endpoint-ping").search(search);
                break;
              case "dns":
                self.$location.path("/dashboard/db/worldping-endpoint-dns").search(search);
                break;
              case "http":
                search['var-protocol'] = "http";
                self.$location.path("/dashboard/db/worldping-endpoint-web").search(search);
                break;
              case "https":
                search['var-protocol'] = "https";
                self.$location.path("/dashboard/db/worldping-endpoint-web").search(search);
                break;
              default:
                self.$location.path("/dashboard/db/worldping-endpoint-summary").search(search);
                break;
            }
          }
        }]);

        return EndpointConfigCtrl;
      }());

      EndpointConfigCtrl.templateUrl = 'public/plugins/worldping-app/components/endpoint/partials/endpoint_config.html';

      _export("EndpointConfigCtrl", EndpointConfigCtrl);
    }
  };
});
//# sourceMappingURL=endpoint_config.js.map