#!/bin/bash
# Runs inside the tp8-lab container (hostname kali) with /lab = tp/tp8/work.
# Emits a literal transcript delimited by @@CMD/@@OUT/@@END; each run() block
# becomes one terminal screenshot (parsed by content.js).
cd /lab && rm -rf A B C && mkdir A B C
run() { echo "@@CMD"; echo "$*"; echo "@@OUT"; bash -c "$*" 2>&1; echo "@@END"; }
sec() { echo; echo "######## $1"; }

sec A.1
cd /lab/A
run 'echo "rocommunity catedra" | tee -a /etc/snmp/snmpd.conf'
run 'systemctl restart snmpd 2>/dev/null || { pkill snmpd; sleep 1; snmpd -Lsd -Lf /var/log/snmpd.log -p /run/snmpd.pid; }; sleep 2; pgrep -a snmpd'
run 'snmpwalk -v2c -c catedra localhost | head -20'
run 'snmpget -v2c -c catedra localhost sysDescr.0'
run 'snmpget -v2c -c catedra localhost sysUpTime.0'
run 'snmpget -v2c -c catedra localhost sysName.0 sysLocation.0 sysContact.0'

sec A.2
run 'tcpdump -i lo -w snmp.pcap udp port 161 2>/dev/null & sleep 1; snmpget -v2c -c catedra localhost sysDescr.0; sleep 1; kill %1; sleep 1; ls -l snmp.pcap'
run 'tshark -r snmp.pcap -Y snmp -T fields -e frame.number -e ip.src -e ip.dst -e snmp.version -e snmp.community 2>/dev/null'
run 'tshark -r snmp.pcap -Y "snmp && frame.number==1" -V 2>/dev/null | sed -n "/Simple Network Management Protocol/,\$p"'
run 'grep -a -o catedra snmp.pcap'
run 'pkill snmpd; sleep 1; net-snmp-create-v3-user -ro -A authpass123 -X privpass123 -a SHA -x AES tp8user | tail -3; snmpd -Lsd -Lf /var/log/snmpd.log -p /run/snmpd.pid; sleep 2'
run 'tcpdump -i lo -w snmp-v3.pcap udp port 161 2>/dev/null & sleep 1; snmpget -v3 -l authPriv -u tp8user -a SHA -A authpass123 -x AES -X privpass123 localhost sysDescr.0; sleep 1; kill %1; sleep 1; ls -l snmp-v3.pcap'
run 'tshark -r snmp-v3.pcap -Y snmp -V 2>/dev/null | grep -E "msgAuthoritativeEngineID|msgUserName|msgPrivacyParameters|msgData|encryptedPDU|sysDescr|catedra|Linux"'
run 'grep -a -ciE "catedra|sysDescr|Linux kali" snmp-v3.pcap'

sec B
cd /lab/B
run 'cat > /etc/rsyslog.d/tp8.conf <<CONF
template(name="sev" type="string" string="%syslogseverity% (%syslogseverity-text%) %syslogfacility-text% %programname%: %msg%\n")
user.* /var/log/tp8-severidades.log;sev
CONF
rsyslogd 2>/dev/null; sleep 1; pgrep -a rsyslogd'
run 'logger -p user.info  "Prueba INFO desde el TP8"
logger -p user.err   "Prueba ERROR desde el TP8"'
run 'tail -n 20 /var/log/syslog | grep "TP8"'
run 'cat /var/log/tp8-severidades.log'

sec C
cd /lab/C
run 'curl -s http://prometheus:9090/-/ready; curl -s http://grafana:3000/api/health | jq -c .'
run "curl -s 'http://prometheus:9090/api/v1/query?query=up' | jq ."
run "curl -s 'http://prometheus:9090/api/v1/targets' | jq '.data.activeTargets[] | {job: .labels.job, instance: .labels.instance, health: .health}'"
run "curl -s -u admin:admin -H 'Content-Type: application/json' -X POST http://grafana:3000/api/datasources -d '{\"name\":\"Prometheus\",\"type\":\"prometheus\",\"url\":\"http://prometheus:9090\",\"access\":\"proxy\",\"isDefault\":true}' | jq '{message, name: .datasource.name, type: .datasource.type, url: .datasource.url}'"
run "UID_DS=\$(curl -s -u admin:admin http://grafana:3000/api/datasources/name/Prometheus | jq -r .uid); curl -s -u admin:admin \"http://grafana:3000/api/datasources/proxy/uid/\$UID_DS/api/v1/query?query=up\" | jq -c '.data.result[] | {job: .metric.job, up: .value[1]}'"
