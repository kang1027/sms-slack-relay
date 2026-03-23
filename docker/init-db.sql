CREATE DATABASE IF NOT EXISTS toont_relay;
CREATE USER IF NOT EXISTS 'toont'@'%' IDENTIFIED BY 'toont_password';
GRANT ALL PRIVILEGES ON toont_relay.* TO 'toont'@'%';

-- ASG는 sms_gateway DB를 자동 생성하므로 유저만 생성
CREATE USER IF NOT EXISTS 'smsgateway'@'%' IDENTIFIED BY 'smsgateway_password';
GRANT ALL PRIVILEGES ON sms_gateway.* TO 'smsgateway'@'%';

FLUSH PRIVILEGES;
