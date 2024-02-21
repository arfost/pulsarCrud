import { readFile, writeFile } from 'fs';

function getCollection(store, path) {
  let [collectionName, documentId, ...nodes] = path.split("/");
  let coll = store.getCollection(collectionName);
  if (documentId) {
    coll = coll.get(documentId);
    return coll;
  }
  if (nodes && nodes.length > 0) {
    for (let node of nodes) {
      coll = coll[node];
    }
    return coll;
  }

  return Array.from(coll.entries()).map(([id, data]) => {
    return {
      id,
      data
    }
  });
}


export function createCrudServer(store, pulsar) {

  let dataPoints = {};
  let usersForDataPoint = {};

  pulsar.registerDataConsummerAddon((userId, dataPointName) => {
    if (!usersForDataPoint[dataPointName]) {
      usersForDataPoint[dataPointName] = new Set();
    }
    usersForDataPoint[dataPointName].add(userId);
    // console.log("users for data point : ", usersForDataPoint);
  });

  const getRegistredUsersForCollection = (collectionName) => {
    // console.log("users for data point : ", Array.from(usersForDataPoint[collectionName] || []));
    return Array.from(usersForDataPoint[collectionName] || []);
  }

  for (let collectionName of store.collectionList.keys()) {
    dataPoints[collectionName] = (userId, path) => {
      return getCollection(store, path);
    }
  }

  pulsar.registerDataPoints(dataPoints);

  let actions = {
    updateDoc(userId, { collectionName, documentId, documentData }) {
      if (!store.asCollection(collectionName)) {
        store.createCollection(collectionName);
        pulsar.registerDataPoints({
          [collectionName]: (userId, path) => {
            return getCollection(store, path);
          }
        });
      }
      store.updateDocumentInCollection(collectionName, documentId, documentData);
      pulsar.broadcastDataPoint(getRegistredUsersForCollection(collectionName), collectionName);
      pulsar.broadcastDataPoint(getRegistredUsersForCollection([collectionName, documentId].join("/")), [collectionName, documentId].join("/"));
      return { collectionName, id: documentId}
    },
    deleteDoc(userId, { collectionName, documentId }) {
      if (!store.asCollection(collectionName)) {
        store.createCollection(collectionName);
        pulsar.registerDataPoints({
          [collectionName]: (userId, path) => {
            return getCollection(store, path);
          }
        });
      }
      store.deleteDocumentInCollection(collectionName, documentId);
      pulsar.broadcastDataPoint(getRegistredUsersForCollection(collectionName), collectionName);
      pulsar.broadcastDataPoint(getRegistredUsersForCollection([collectionName, documentId].join("/")), [collectionName, documentId].join("/"));
      return { collectionName, id: documentId}
    },
    createDoc(userId, { collectionName, documentData }) {
      if (!store.asCollection(collectionName)) {
        store.createCollection(collectionName);
        pulsar.registerDataPoints({
          [collectionName]: (userId, path) => {
            return getCollection(store, path);
          }
        });
      }
      let id = store.createDocumentInCollection(collectionName, documentData);
      pulsar.broadcastDataPoint(getRegistredUsersForCollection(collectionName), collectionName);
      return { collectionName, id}
    },
    deleteCollection(userId, collectionName) {
      if (!store.asCollection(collectionName)) {
        store.createCollection(collectionName);
        pulsar.registerDataPoints({
          [collectionName]: (userId, path) => {
            return getCollection(store, path);
          }
        });
      }
      store.deleteCollection(collectionName);
      pulsar.broadcastDataPoint(getRegistredUsersForCollection(collectionName), collectionName);
      return { collectionName };
    },
  }

  pulsar.registerAction(actions);

  return {
    collectionList: store.collectionList,
    save() {
      return store.save();
    },
    load(data) {
      store.load(data);
      for (let collectionName in data) {
        if (!pulsar.dataSources[collectionName]) {
          pulsar.registerDataPoints({
            [collectionName]: (userId, path) => {
              return getCollection(store, path);
            }
          });
        }
      }
    },
    saveToFile(fileName){
      let data = store.save();
      writeFile(`./saves/${fileName ? fileName : "data"}.json`, JSON.stringify(data, null, 4), (err) => {
        if (err) {
          console.error("couldn't save datas", err);
        } else {
          console.log('Save done');
        }
      });
    },
    loadFromFile(fileName){
      readFile(`./saves/${fileName ? fileName : "data"}.json`, (err, data) => {
        if (err) {
          console.error("couldn't read data", err);
        }else{
          let datas = JSON.parse(data);
          this.load(datas);
        }
      });
    }
  }
}