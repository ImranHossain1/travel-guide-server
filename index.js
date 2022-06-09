const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express')
const cors = require('cors')
require('dotenv').config();
const app= express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 5000
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6hmhs.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run(){
  try{
    await client.connect();
    const destinationCollection = client.db('TravelGuide').collection('destinations');
    const photoCollection = client.db('TravelGuide').collection('gallery');

    app.get('/destination', async(req,res)=>{
      const query= {};
      const cursor= destinationCollection.find(query);
      const destinations =await cursor.toArray();
      res.send(destinations);
    })
    app.get('/gallery', async(req,res)=>{
      const query= {};
      const cursor= photoCollection.find(query);
      const photos =await cursor.toArray();
      res.send(photos);
    })
  }
  finally{

  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello from car dealer!')
})

app.listen(port, () => {
  console.log(`car dealer app listening on port ${port}`)
})