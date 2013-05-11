/*
 * JSONSerializer
 * Serializes and deserializes data to and from json
 */
RESTless.JSONSerializer = RESTless.Serializer.extend({

  dataType: 'json',
  contentType: 'application/json; charset=utf-8',

  prepareData: function(data) {
    return JSON.stringify(data);
  },

  /* 
   * deserialize: translates json object into a model. i.e:
   * { id:1, name:'post 1' }
   */
  deserialize: function(resource, data) {
    // Check if data is wrapped (ActiveRecord): { post: { id:1, name:'post 1' } }
    var resourceName = get(resource.constructor, 'resourceName'), prop;
    if(data[resourceName]) {
      data = data[resourceName];
    }

    Ember.beginPropertyChanges(resource);
    for(prop in data) {
      if (data.hasOwnProperty(prop)) {
        this.deserializeProperty(resource, prop, data[prop]);
      }
    }
    Ember.endPropertyChanges(resource);
    return resource;
  },

  /* 
   * deserializeProperty: sets model object properties from json
   */
  deserializeProperty: function(resource, prop, value) {
    var formattedProp = prop.camelize(),
          modelConfig = get(RESTless, 'client._modelConfigs').get(resource.constructor.toString());
 
    // check if a custom key was configured for this property
    if(modelConfig && modelConfig.propertyKeys && modelConfig.propertyKeys[formattedProp]) {
      formattedProp = modelConfig.propertyKeys[formattedProp];
    } else if(get(resource, formattedProp) === undefined) {
      // If the json contains a key not defined on the model, don't attempt to set it.
      return;
    }
    var attrMap = get(resource.constructor, 'attributeMap'),
        attr = attrMap[formattedProp],
        attrType = attr.get('type');

    // If property is a hasMany relationship, deserialze the array
    if(attr.get('hasMany')) {
      var hasManyArr = this.deserializeMany(resource.get(formattedProp), attrType, value);
      resource.set(formattedProp, hasManyArr);
    } 
    // If property is a belongsTo relationship, deserialze that model
    else if(attr.get('belongsTo')) {
      var belongsToModel = get(Ember.lookup, attrType).create();
      this.deserialize(belongsToModel, value);
      resource.set(formattedProp, belongsToModel);
      Ember.run.next(function() {
        belongsToModel.set('isLoaded', true);
      });
    }
    else {
      // Check for a custom transform
      if(attrType && RESTless.JSONTransforms[attrType]) {
        value = RESTless.JSONTransforms[attrType].deserialize(value);
      }
      resource.set(formattedProp, value);
    }
  },

  /* 
   * deserializeMany: deserializes an array of json objects
   */
  deserializeMany: function(resource, type, data) {
    // extract any meta info
    var meta = this.extractMeta(data);
    if(meta) { resource.set('meta', meta); }

    // findAll from ActiveRecord returns { posts: [...] }
    if(!$.isArray(data)) {
      data = data[resource.get('resourceTypeNamePlural')];
    }
    if(!data) { 
      return; 
    }

    var len = data.length,
        resourceArr = [], item, i;
    if(resource) {
      resource.clear();
    } else {
      resource = RESTless.RecordArray.createWithContent({type: type});
    }
    for(i=0; i<len; i++) {
      item = get(Ember.lookup, type).create().deserialize(data[i]);
      resourceArr.push(item);
    }
    if(resourceArr.length) {
      resource.pushObjects(resourceArr);
    }
    Ember.run.next(function() {
      resource.set('isLoaded', true);
    });
    return resource;
  },

  /* 
   * serialize: turns model into json
   */
  serialize: function(resource) {
    var resourceName = get(resource.constructor, 'resourceName'),
        attrMap = get(resource.constructor, 'attributeMap'),
        json = {}, attr, val;

    json[resourceName] = {};
    for(attr in attrMap) {
      //Don't include readOnly properties or to-one relationships
      if (attrMap.hasOwnProperty(attr) && !attrMap[attr].get('readOnly') && !attrMap[attr].get('belongsTo')) {
        val = this.serializeProperty(resource, attr);
        if(val !== null) {
          json[resourceName][attr.decamelize()] = val;
        }
      }
    }  
    return json;
  },

  /* 
   * serializeProperty: transform model property into json
   */
  serializeProperty: function(resource, prop) {
    var value = resource.get(prop),
        attrMap = get(resource.constructor, 'attributeMap'),
        attr = attrMap[prop],
        attrType = attr.get('type');

    if(attr.get('hasMany')) {
      return this.serializeMany(value.get('content'), attrType);
    }

    //Check for a custom transform
    if(attrType && RESTless.JSONTransforms[attrType]) {
      value = RESTless.JSONTransforms[attrType].serialize(value);
    }
    return value;
  },

  /* 
   * serializeMany: serializes an array of models into json
   */
  serializeMany: function(resourceArr, type) {
    var resourceName = get(get(Ember.lookup, type), 'resourceName'),
        result = [],
        len = resourceArr.length, i;
    for(i=0; i<len; i++) {
      var item = resourceArr[i].serialize();
      result.push(item[resourceName]);
    }
    return result;
  },

  /*
   * extractMeta: attempts to extract metadata on json responses
   */
  extractMeta: function(json) {
    if(json && json.meta) {
      return json.meta;
    }
  },

  /*
   * registerTransform: adds a custom tranform to JSONTransforms
   */
  registerTransform: function(type, transform) {
    RESTless.JSONTransforms[type] = transform;
  }
});

/*
 * JSONTransforms
 * Hash for custom json transforms
 * Bulding with json_transforms.js is optional, and will overwrite this
 */
RESTless.JSONTransforms = {};
