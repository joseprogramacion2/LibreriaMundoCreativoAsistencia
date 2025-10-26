import ZKLib from "node-zklib";

async function main() {
  const ip = "192.168.1.201";
  const port = 4370;
  const zk = new ZKLib(ip, port, 10000, 4000);
  await zk.createSocket();
  const info = await zk.getInfo().catch(()=>null);
  console.log("OK, info:", info);
  await zk.disconnect();
}
main().catch(e => console.error("Probe error:", e));
