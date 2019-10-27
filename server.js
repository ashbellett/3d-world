const express = require('express');
const app = express();
const port = 3000;

app.use(express.static('./3d-world'));
app.get('/', (req, res) => res.send('On.'));
app.listen(port, () => console.log(`Listening on port ${port}\n`));
